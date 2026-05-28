import { FastifyInstance, FastifyRequest } from "fastify";
import {
  requireWixAuth,
  requireHubSpotConnection,
} from "../middleware/auth.js";
import { getSupabase } from "../db/client.js";
import { createHubSpotClient } from "../services/hubspot/client.js";
import {
  startBulkSync,
  getBulkSyncStatus,
} from "../services/sync/bulk-sync.js";

const KNOWN_PROP_LABELS: Record<string, string> = {
  email: "Email",
  firstname: "First Name",
  lastname: "Last Name",
  phone: "Phone",
  company: "Company",
  website: "Website",
  city: "City",
  state: "State",
  country: "Country",
  zip: "ZIP",
};

function propLabel(prop: string): string {
  return (
    KNOWN_PROP_LABELS[prop] ??
    prop.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export async function contactsRoutes(fastify: FastifyInstance) {
  // ── GET /api/contacts/sync-status ───────────────────────────────────────
  // Dashboard: recent sync events for this site
  fastify.get(
    "/api/contacts/sync-status",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const limit = Math.min(
        Number((request.query as Record<string, string>).limit ?? 20),
        100,
      );

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("sync_events")
        .select(
          "id,event_type,source,status,error,created_at,completed_at,wix_contact_id,hubspot_contact_id",
        )
        .eq("wix_site_id", wixSiteId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return reply.send({ events: data });
    },
  );

  // ── GET /api/contacts/mappings ──────────────────────────────────────────
  fastify.get(
    "/api/contacts/mappings",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("contact_mappings")
        .select(
          "wix_contact_id,hubspot_contact_id,last_synced_at,last_sync_source",
        )
        .eq("wix_site_id", wixSiteId)
        .order("last_synced_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return reply.send({ mappings: data, total: data?.length ?? 0 });
    },
  );

  // ── GET /api/contacts/stats ─────────────────────────────────────────────
  fastify.get(
    "/api/contacts/stats",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const supabase = getSupabase();

      const [mappingsResult, syncResult, formsResult] = await Promise.all([
        supabase
          .from("contact_mappings")
          .select("id", { count: "exact", head: true })
          .eq("wix_site_id", wixSiteId),
        supabase
          .from("sync_events")
          .select("status", { count: "exact" })
          .eq("wix_site_id", wixSiteId)
          .eq("status", "failed")
          .gte(
            "created_at",
            new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
          ),
        supabase
          .from("form_submissions")
          .select("id", { count: "exact", head: true })
          .eq("wix_site_id", wixSiteId),
      ]);

      return reply.send({
        totalMappedContacts: mappingsResult.count ?? 0,
        failedSyncsLast24h: syncResult.count ?? 0,
        totalFormSubmissions: formsResult.count ?? 0,
      });
    },
  );

  // ── GET /api/contacts/list ──────────────────────────────────────────────
  // Returns synced contacts from HubSpot, with only the user-mapped fields as columns.
  // Email is always included as the identifier column.
  fastify.get(
    "/api/contacts/list",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const supabase = getSupabase();
      const PAGE_SIZE = 25;
      const page = Math.max(
        0,
        Number((request.query as Record<string, string>).page ?? 0),
      );

      // Active field mappings define which columns to show
      const { data: fieldMappings } = await supabase
        .from("field_mappings")
        .select("wix_field, hubspot_property")
        .eq("wix_site_id", wixSiteId)
        .eq("is_active", true);

      const mappedProps = (fieldMappings ?? []).map(
        (m) => m.hubspot_property as string,
      );
      // Email is always fetched as the row identifier
      const propsToFetch = [
        "email",
        ...mappedProps.filter((p) => p !== "email"),
      ];

      // Build column definitions (label is derived from property name)
      const columns = propsToFetch.map((prop) => ({
        key: prop,
        label: propLabel(prop),
      }));

      // Paged HubSpot contact IDs from our mapping table
      const { data: contactMappings, count } = await supabase
        .from("contact_mappings")
        .select("hubspot_contact_id", { count: "exact" })
        .eq("wix_site_id", wixSiteId)
        .order("last_synced_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (!contactMappings?.length) {
        return reply.send({ contacts: [], columns, total: count ?? 0 });
      }

      // Batch-read those contacts from HubSpot
      const hsClient = createHubSpotClient(wixSiteId);
      const batchRes = await hsClient.post<{
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
        }>;
      }>("/crm/v3/objects/contacts/batch/read", {
        inputs: contactMappings.map((m) => ({ id: m.hubspot_contact_id })),
        properties: propsToFetch,
      });

      const contacts = batchRes.data.results.map((r) => {
        const row: Record<string, string> = { _id: r.id };
        for (const prop of propsToFetch) {
          row[prop] = r.properties[prop] ?? "";
        }
        return row;
      });

      return reply.send({ contacts, columns, total: count ?? 0 });
    },
  );

  // ── POST /api/contacts/bulk-sync ────────────────────────────────────────
  // Kicks off a one-time full sync of all Wix contacts → HubSpot.
  // Safe to call multiple times — returns existing job ID if one is already running.
  fastify.post(
    "/api/contacts/bulk-sync",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const jobId = await startBulkSync(wixSiteId);
      return reply.send({ jobId });
    },
  );

  // ── GET /api/contacts/bulk-sync/status ──────────────────────────────────
  // Returns the most recent bulk sync job for this site (or null if none).
  fastify.get(
    "/api/contacts/bulk-sync/status",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const job = await getBulkSyncStatus(wixSiteId);
      return reply.send({ job });
    },
  );
}
