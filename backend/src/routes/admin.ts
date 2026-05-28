import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { pollAllConnectedSites } from "../services/sync/poller.js";
import { contactSyncQueue, webhookQueue } from "../jobs/queue.js";
import { getSupabase } from "../db/client.js";
import { logger } from "../utils/logger.js";

const injectSchema = z.object({
  wixSiteId: z.string().min(1),
  source: z.enum(["wix", "hubspot"]),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // POST /api/admin/poll-hubspot — manually trigger HubSpot poll for all sites
  fastify.post("/api/admin/poll-hubspot", async (_request, reply) => {
    logger.info("Manual HubSpot poll triggered via admin endpoint");
    await pollAllConnectedSites();
    return reply.send({
      ok: true,
      message: "Poll triggered — check sync status in 10s",
    });
  });

  // POST /api/admin/drain-queues — remove all failed/delayed jobs so stale retries stop
  fastify.post("/api/admin/drain-queues", async (_request, reply) => {
    const [csF, csD, wqF, wqD] = await Promise.all([
      contactSyncQueue.clean(0, 10_000, "failed"),
      contactSyncQueue.clean(0, 10_000, "delayed"),
      webhookQueue.clean(0, 10_000, "failed"),
      webhookQueue.clean(0, 10_000, "delayed"),
    ]);
    const removed = {
      contactSync: { failed: csF.length, delayed: csD.length },
      webhook: { failed: wqF.length, delayed: wqD.length },
    };
    logger.info(removed, "Admin: drained queues");
    return reply.send({ ok: true, removed });
  });

  // POST /api/admin/clear-failed-events — delete all failed sync_events rows
  fastify.post("/api/admin/clear-failed-events", async (_request, reply) => {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from("sync_events")
      .delete({ count: "exact" })
      .eq("status", "failed");
    if (error) throw error;
    logger.info({ count }, "Admin: cleared failed sync events");
    return reply.send({ ok: true, deleted: count });
  });

  // POST /api/admin/fix-site-ids?from=<oldId>&to=<newId>
  // Migrates all DB rows from oldId → newId, deletes the old OAuth token row.
  // Use this to collapse two site-ID rows into one canonical ID.
  fastify.post("/api/admin/fix-site-ids", async (request, reply) => {
    const { from: fromId, to: toId } = request.query as Record<string, string>;
    if (!fromId || !toId) {
      return reply
        .code(400)
        .send({ error: "Provide ?from=<oldSiteId>&to=<newSiteId>" });
    }
    const supabase = getSupabase();

    // Migrate existing contact mappings to the canonical ID
    const { count: mappingsMigrated } = await supabase
      .from("contact_mappings")
      .update({ wix_site_id: toId })
      .eq("wix_site_id", fromId);

    // Migrate sync events
    await supabase
      .from("sync_events")
      .update({ wix_site_id: toId })
      .eq("wix_site_id", fromId);

    // Migrate field mappings
    await supabase
      .from("field_mappings")
      .update({ wix_site_id: toId })
      .eq("wix_site_id", fromId);

    // Delete the stale OAuth token row (the canonical row stays)
    await supabase.from("oauth_tokens").delete().eq("wix_site_id", fromId);

    const result = {
      from: fromId,
      to: toId,
      contactMappingsMigrated: mappingsMigrated,
    };
    logger.info(result, "Admin: fix-site-ids complete");
    return reply.send({ ok: true, ...result });
  });

  // GET /api/admin/status — show site IDs stored in the DB (for diagnosing wrong-ID issues)
  fastify.get("/api/admin/status", async (_request, reply) => {
    const supabase = getSupabase();
    const [tokens, mappings] = await Promise.all([
      supabase
        .from("oauth_tokens")
        .select("wix_site_id, hubspot_portal_id, token_expires_at"),
      supabase
        .from("contact_mappings")
        .select("wix_site_id, wix_contact_id, hubspot_contact_id")
        .limit(5),
    ]);
    return reply.send({
      oauth_tokens: tokens.data ?? [],
      contact_mappings_sample: mappings.data ?? [],
    });
  });

  // POST /api/admin/inject-contact — simulate a contact event for testing both directions
  fastify.post("/api/admin/inject-contact", async (request, reply) => {
    const body = injectSchema.parse(
      (request as FastifyRequest & { body: unknown }).body,
    );
    const { wixSiteId, source, email, firstName, lastName, phone, company } =
      body;

    const jobData =
      source === "wix"
        ? {
            wixSiteId,
            source: "wix" as const,
            eventType: "contact_created" as const,
            contactId: `test-${Date.now()}`,
            email,
            firstName,
            lastName,
            phone,
            company,
          }
        : {
            wixSiteId,
            source: "hubspot" as const,
            eventType: "contact_created" as const,
            contactId: `test-hs-${Date.now()}`,
            email,
            properties: Object.fromEntries(
              Object.entries({
                email,
                firstname: firstName,
                lastname: lastName,
                phone,
                company,
              }).filter(([, v]) => v !== undefined),
            ) as Record<string, string>,
          };

    await contactSyncQueue.add(`test-inject-${Date.now()}`, jobData);
    logger.info({ source, email, wixSiteId }, "Test contact inject enqueued");
    return reply.send({
      ok: true,
      message: `${source} contact sync enqueued for ${email}`,
    });
  });
}
