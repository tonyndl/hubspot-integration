import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  verifyHubSpotWebhookSignature,
  verifyWixWebhookSignature,
} from "../middleware/auth.js";
import { webhookQueue, contactSyncQueue } from "../jobs/queue.js";
import { getSupabase } from "../db/client.js";
import { logger } from "../utils/logger.js";

export async function webhookRoutes(fastify: FastifyInstance) {
  // ── POST /api/webhooks/hubspot ──────────────────────────────────────────
  // Receives HubSpot CRM subscription events (contact created / updated)
  fastify.post(
    "/api/webhooks/hubspot",
    {
      config: { rawBody: true }, // need raw body for HMAC verification
    },
    async (request, reply) => {
      const rawBody =
        (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
      const signature =
        (request.headers["x-hubspot-signature-v3"] as string) ?? "";
      const requestUri = `${config_url(request)}`;

      if (
        !verifyHubSpotWebhookSignature(
          rawBody,
          signature,
          requestUri,
          request.method,
        )
      ) {
        logger.warn("HubSpot webhook signature verification failed");
        return reply.code(401).send({ error: "Invalid signature" });
      }

      // Determine wix_site_id from the portalId in the payload
      // HubSpot webhooks are per-app, so we look up the site by portalId
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return reply.code(400).send({ error: "Invalid JSON" });
      }

      const events = Array.isArray(payload) ? payload : [payload];
      const portalId = events[0]?.portalId ? String(events[0].portalId) : null;

      if (!portalId) {
        return reply.code(400).send({ error: "Missing portalId in webhook" });
      }

      // Find the wix site associated with this HubSpot portal
      const supabase = getSupabase();
      const { data: tokenRow } = await supabase
        .from("oauth_tokens")
        .select("wix_site_id")
        .eq("hubspot_portal_id", portalId)
        .single();

      if (!tokenRow) {
        logger.warn(
          { portalId },
          "No site found for HubSpot portal — ignoring webhook",
        );
        return reply.code(200).send({ ok: true }); // 200 to prevent HubSpot retries
      }

      logger.info(
        { portalId, wixSiteId: tokenRow.wix_site_id, events },
        "HubSpot webhook raw payload",
      );

      await webhookQueue.add(`hs-webhook-${portalId}-${Date.now()}`, {
        wixSiteId: tokenRow.wix_site_id,
        source: "hubspot",
        rawPayload: payload,
        receivedAt: new Date().toISOString(),
      });

      logger.info(
        { portalId, wixSiteId: tokenRow.wix_site_id },
        "HubSpot webhook enqueued",
      );
      return reply.code(200).send({ ok: true });
    },
  );

  // ── POST /api/webhooks/wix ──────────────────────────────────────────────
  // Receives Wix contact events (contact created / updated)
  fastify.post(
    "/api/webhooks/wix",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const rawBody =
        (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
      const signature = (request.headers["x-wix-signature"] as string) ?? "";

      if (!verifyWixWebhookSignature(rawBody, signature)) {
        logger.warn("Wix webhook signature verification failed");
        return reply.code(401).send({ error: "Invalid signature" });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return reply.code(400).send({ error: "Invalid JSON" });
      }

      const wixEvent = payload as { instanceId?: string };
      const wixSiteId = wixEvent.instanceId;

      if (!wixSiteId) {
        return reply.code(400).send({ error: "Missing instanceId" });
      }

      await webhookQueue.add(`wix-webhook-${wixSiteId}-${Date.now()}`, {
        wixSiteId,
        source: "wix",
        rawPayload: payload,
        receivedAt: new Date().toISOString(),
      });

      logger.info({ wixSiteId }, "Wix webhook enqueued");
      return reply.code(200).send({ ok: true });
    },
  );

  // ── POST /api/webhooks/wix-contact ─────────────────────────────────────
  // Called directly from Wix CRM event hooks (contacts.web.ts) when a
  // contact is created or updated. No raw-body HMAC needed — the Wix backend
  // runs server-side inside the Wix platform.
  const wixContactSchema = z.object({
    wixSiteId: z.string().min(1),
    source: z.literal("wix"),
    eventType: z.enum(["contact_created", "contact_updated"]),
    contactId: z.string().min(1),
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
  });

  fastify.post("/api/webhooks/wix-contact", async (request, reply) => {
    const body = wixContactSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const {
      wixSiteId,
      eventType,
      contactId,
      email,
      firstName,
      lastName,
      phone,
      company,
    } = body.data;

    await contactSyncQueue.add(
      `wix-hook-${wixSiteId}-${contactId}-${Date.now()}`,
      {
        wixSiteId,
        source: "wix",
        eventType,
        contactId,
        email,
        firstName,
        lastName,
        phone,
        company,
      },
    );

    logger.info(
      { wixSiteId, contactId, email, eventType },
      "Wix contact hook enqueued",
    );
    return reply.send({ ok: true });
  });
}

function config_url(request: FastifyRequest): string {
  const proto = request.headers["x-forwarded-proto"] ?? "https";
  const host = request.headers["host"];
  return `${proto}://${host}${request.url}`;
}
