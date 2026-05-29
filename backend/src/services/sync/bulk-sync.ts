import { getSupabase, FieldMappingRow } from "../../db/client.js";
import { createWixClient } from "../wix/client.js";
import { createHubSpotClient } from "../hubspot/client.js";
import {
  batchUpsertHubSpotContacts,
  BatchUpsertInput,
} from "../hubspot/contacts.js";
import { WixContact } from "../wix/contacts.js";
import {
  syncHubSpotContactToWix,
  HubSpotContactPayload,
} from "./engine.js";
import { logger } from "../../utils/logger.js";
import { AxiosInstance } from "axios";

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

interface HsContact {
  id: string;
  properties: Record<string, string>;
  paging?: { next?: { after?: string } };
}

const BATCH_SIZE = 100;
const WIX_CONCURRENCY = 5;

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
  let total = 0;

  const updateJob = (fields: Partial<BulkSyncJob>) =>
    supabase.from("bulk_sync_jobs").update(fields).eq("id", jobId);

  const { data: fmData } = await supabase
    .from("field_mappings")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .eq("is_active", true);
  const fieldMappings = (fmData ?? []) as FieldMappingRow[];
  const wixToHsMappings = fieldMappings.filter(
    (m) => m.sync_direction !== "hubspot_to_wix",
  );

  try {
    // ── Phase 1: Wix → HubSpot ──────────────────────────────────────────────
    // Fetch all Wix contacts using offset pagination and batch-upsert to HubSpot.
    let offset = 0;

    while (true) {
      const rawRes = await wixClient.post("/contacts/v4/contacts/query", {
        query: {
          sort: [{ fieldName: "createdDate", order: "ASC" }],
          paging: { limit: BATCH_SIZE, offset },
        },
        fieldsets: ["EXTENDED"],
      });
      const pageData = rawRes.data as WixPageResponse;
      const contacts: WixContact[] = pageData.contacts ?? [];
      const meta = pageData.pagingMetadata;

      if (offset === 0 && meta?.total) {
        total += meta.total;
        await updateJob({ total });
      }

      const inputs: BatchUpsertInput[] = [];
      const contactIds: string[] = [];

      for (const c of contacts) {
        const email =
          c.primaryEmail?.email ??
          c.info?.emails?.items?.find(
            (item: { email: string; primary?: boolean }) => item.primary,
          )?.email ??
          c.info?.emails?.items?.[0]?.email;

        if (!email) continue;

        const properties: Record<string, string> = { email };
        for (const m of wixToHsMappings) {
          const value = extractWixField(c, m.wix_field);
          if (value) properties[m.hubspot_property] = value;
        }

        inputs.push({ email, properties });
        contactIds.push(c.id);
      }

      if (inputs.length) {
        try {
          const results = await batchUpsertHubSpotContacts(hsClient, inputs);
          const now = new Date().toISOString();

          // Match by email (results order is not guaranteed by HubSpot)
          const emailToWixId = new Map(
            contactIds.map((id, i) => [inputs[i].email.toLowerCase(), id]),
          );
          const mappingRows = results
            .filter((r) => r.id && emailToWixId.has(r.email.toLowerCase()))
            .map((r) => ({
              wix_site_id: wixSiteId,
              wix_contact_id: emailToWixId.get(r.email.toLowerCase())!,
              hubspot_contact_id: r.id,
              last_synced_at: now,
              last_sync_source: "wix",
            }));

          await supabase
            .from("contact_mappings")
            .upsert(mappingRows, { onConflict: "wix_site_id,wix_contact_id" });

          synced += results.filter((r) => r.id).length;
        } catch (batchErr) {
          logger.warn({ batchErr, count: inputs.length }, "Wix→HS batch failed");
          failedCount += inputs.length;
        }
      }

      await updateJob({ synced, failed_count: failedCount, total });

      if (!meta?.hasNext) break;
      offset += contacts.length;
    }

    // ── Phase 2: HubSpot → Wix ──────────────────────────────────────────────
    // Fetch all HubSpot contacts and create/update them in Wix.
    let after: string | undefined;

    do {
      const res = await hsClient.get<{
        results: HsContact[];
        paging?: { next?: { after?: string } };
      }>("/crm/v3/objects/contacts", {
        params: {
          limit: BATCH_SIZE,
          after,
          properties: "email,firstname,lastname,phone,company",
        },
      });

      const hsContacts = res.data.results;
      total += hsContacts.length;
      await updateJob({ total });

      // Process in parallel batches to avoid Wix rate limits
      for (let i = 0; i < hsContacts.length; i += WIX_CONCURRENCY) {
        const chunk = hsContacts.slice(i, i + WIX_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (c) => {
            if (!c.properties.email) return;
            try {
              await syncHubSpotContactToWix(
                wixSiteId,
                {
                  contactId: c.id,
                  email: c.properties.email,
                  properties: c.properties,
                } as HubSpotContactPayload,
                "contact_created",
              );
              synced++;
            } catch (err) {
              logger.warn({ err, hsContactId: c.id }, "HS→Wix bulk contact failed");
              failedCount++;
            }
          }),
        );
        await updateJob({ synced, failed_count: failedCount, total });
      }

      after = res.data.paging?.next?.after;
    } while (after);

    await updateJob({
      status: "completed",
      synced,
      failed_count: failedCount,
      total,
      completed_at: new Date().toISOString(),
    });

    logger.info({ wixSiteId, jobId, synced, failedCount, total }, "Bulk sync completed");
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
