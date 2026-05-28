import { getSupabase } from "../../db/client.js";
import { createWixClient } from "../wix/client.js";
import { createHubSpotClient } from "../hubspot/client.js";
import {
  batchUpsertHubSpotContacts,
  BatchUpsertInput,
} from "../hubspot/contacts.js";
import { WixContact } from "../wix/contacts.js";
import { FieldMappingRow } from "../../db/client.js";
import { logger } from "../../utils/logger.js";

// Extract a field value from a raw WixContact by its API path key
function extractWixField(c: WixContact, wixField: string): string | undefined {
  const map: Record<string, string | undefined> = {
    "info.name.first": c.info?.name?.first,
    "info.name.last": c.info?.name?.last,
    "info.emails[0].email":
      c.primaryEmail?.email ?? c.info?.emails?.items?.[0]?.email,
    "info.phones[0].phone": c.info?.phones?.items?.[0]?.phone,
    "info.company.name": c.info?.company?.name,
  };
  return map[wixField];
}

export interface BulkSyncJob {
  id: string;
  wix_site_id: string;
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  synced: number;
  failed_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

interface WixPageResponse {
  contacts?: WixContact[];
  pagingMetadata?: {
    total?: number;
    hasNext?: boolean;
    cursors?: { next?: string };
  };
}

const BATCH_SIZE = 100;

export async function getBulkSyncStatus(
  wixSiteId: string,
): Promise<BulkSyncJob | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("bulk_sync_jobs")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BulkSyncJob | null) ?? null;
}

export async function startBulkSync(wixSiteId: string): Promise<string> {
  const supabase = getSupabase();

  // Return existing running job instead of starting a duplicate
  const { data: existing } = await supabase
    .from("bulk_sync_jobs")
    .select("id")
    .eq("wix_site_id", wixSiteId)
    .eq("status", "running")
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: job, error } = await supabase
    .from("bulk_sync_jobs")
    .insert({ wix_site_id: wixSiteId, status: "running" })
    .select()
    .single();

  if (error || !job) throw new Error("Failed to create bulk sync job");

  // Fire-and-forget — progress is tracked via DB updates
  runBulkSync(wixSiteId, (job as { id: string }).id).catch((err) =>
    logger.error(
      { err, wixSiteId, jobId: (job as { id: string }).id },
      "Bulk sync failed",
    ),
  );

  return (job as { id: string }).id;
}

async function runBulkSync(wixSiteId: string, jobId: string): Promise<void> {
  const supabase = getSupabase();
  const wixClient = createWixClient(wixSiteId);
  const hsClient = createHubSpotClient(wixSiteId);

  let synced = 0;
  let failedCount = 0;
  let totalFetched = 0;

  const updateJob = (fields: Partial<BulkSyncJob>) =>
    supabase.from("bulk_sync_jobs").update(fields).eq("id", jobId);

  // Load field mappings once — only wix_to_hubspot and bidirectional matter here
  const { data: fmData } = await supabase
    .from("field_mappings")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .eq("is_active", true);
  const fieldMappings = (fmData ?? []) as FieldMappingRow[];
  const syncMappings = fieldMappings.filter(
    (m) => m.sync_direction !== "hubspot_to_wix",
  );

  try {
    let cursor: string | null = null;

    while (true) {
      const paging = cursor
        ? { cursor, limit: BATCH_SIZE }
        : { limit: BATCH_SIZE };

      const rawRes = await wixClient.post("/contacts/v4/contacts/query", {
        query: { sort: [{ fieldName: "createdDate", order: "ASC" }], paging },
        fieldsets: ["EXTENDED"],
      });
      const pageData = rawRes.data as WixPageResponse;
      const contacts: WixContact[] = pageData.contacts ?? [];
      const meta: WixPageResponse["pagingMetadata"] = pageData.pagingMetadata;

      // Set total count once on the first page
      if (cursor === null && meta?.total) {
        await updateJob({ total: meta.total });
      }

      // Build HubSpot upsert inputs for contacts that have an email
      const inputs: BatchUpsertInput[] = [];
      const contactIds: string[] = [];

      for (const c of contacts) {
        const email =
          c.primaryEmail?.email ??
          c.info?.emails?.items?.find(
            (item: { email: string; primary?: boolean }) => item.primary,
          )?.email ??
          c.info?.emails?.items?.[0]?.email;

        if (!email) {
          totalFetched++;
          continue;
        }

        // Build properties from field mappings only
        const properties: Record<string, string> = { email };
        for (const m of syncMappings) {
          const value = extractWixField(c, m.wix_field);
          if (value) properties[m.hubspot_property] = value;
        }

        inputs.push({ email, properties });
        contactIds.push(c.id);
        totalFetched++;
      }

      // Batch upsert to HubSpot
      if (inputs.length) {
        try {
          const results = await batchUpsertHubSpotContacts(hsClient, inputs);

          const now = new Date().toISOString();
          const mappingRows = results.map((r, i) => ({
            wix_site_id: wixSiteId,
            wix_contact_id: contactIds[i],
            hubspot_contact_id: r.id,
            last_synced_at: now,
            last_sync_source: "wix",
          }));

          await supabase
            .from("contact_mappings")
            .upsert(mappingRows, { onConflict: "wix_site_id,wix_contact_id" });

          synced += results.length;
        } catch (batchErr) {
          logger.warn(
            { batchErr, count: inputs.length },
            "Bulk sync: HubSpot batch upsert failed",
          );
          failedCount += inputs.length;
        }
      }

      await updateJob({
        synced,
        failed_count: failedCount,
        total: Math.max(totalFetched, synced + failedCount),
      });

      const nextCursor = meta?.hasNext ? (meta?.cursors?.next ?? null) : null;
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    await updateJob({
      status: "completed",
      synced,
      failed_count: failedCount,
      total: totalFetched,
      completed_at: new Date().toISOString(),
    });

    logger.info(
      { wixSiteId, jobId, synced, failedCount, totalFetched },
      "Bulk sync completed",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob({
      status: "failed",
      synced,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
      error: msg,
    });
    logger.error({ err, wixSiteId, jobId }, "Bulk sync failed");
    throw err;
  }
}
