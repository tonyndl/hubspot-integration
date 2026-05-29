import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { config } from "../config/index.js";
import { isConnected } from "../services/token/manager.js";
import { logger } from "../utils/logger.js";

// Verify Wix app instance JWT — Wix passes this in the Authorization header
// for dashboard calls originating from the Wix editor/dashboard.
export async function requireWixAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const instance = (request.query as Record<string, string>)["instance"];
  if (!instance) {
    return reply.code(401).send({ error: "Missing Wix instance parameter" });
  }

  try {
    const siteId = extractWixSiteId(instance);
    (request as FastifyRequest & { wixSiteId: string }).wixSiteId = siteId;
  } catch {
    return reply.code(401).send({ error: "Invalid Wix instance" });
  }
}

// Extract siteId from Wix instance token.
// In dev mode we skip HMAC verification — the CLI signs tokens with a
// different key than the one shown in the dashboard OAuth tab.
// In production set NODE_ENV=production to enforce full signature check.
function extractWixSiteId(instance: string): string {
  const parts = instance.split(".");
  // Format: signature.base64data  OR  just a raw JWT with 3 parts
  const dataB64 = parts.length >= 2 ? parts[parts.length - 1] : instance;

  // Try base64url decode first, then regular base64
  let decoded: { instanceId?: string; siteId?: string; metaSiteId?: string };
  try {
    decoded = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf-8"));
  } catch {
    decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf-8"));
  }

  // Prefer metaSiteId (actual site), then siteId, then fall back to instanceId (app-installation ID)
  let siteId = decoded.metaSiteId ?? decoded.siteId ?? decoded.instanceId;
  if (!siteId) throw new Error("No siteId in token payload");

  // Map known instance ID → canonical meta site ID
  if (
    config.WIX_INSTANCE_ID &&
    config.WIX_META_SITE_ID &&
    siteId === config.WIX_INSTANCE_ID
  ) {
    siteId = config.WIX_META_SITE_ID;
  }

  // If WIX_META_SITE_ID is configured and the JWT didn't carry the metaSiteId
  // explicitly, normalise to it. Wix JWTs sometimes only carry instanceId, which
  // changes across refreshes and breaks DB key consistency.
  if (config.WIX_META_SITE_ID && siteId !== config.WIX_META_SITE_ID) {
    siteId = config.WIX_META_SITE_ID;
  }

  // Full HMAC verification in production only
  if (config.NODE_ENV === "production" && parts.length === 2) {
    const [signatureB64, payloadB64] = parts;
    const hmac = crypto.createHmac("sha256", config.WIX_APP_SECRET);
    hmac.update(payloadB64);
    const expected = hmac.digest("base64url");
    if (
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureB64))
    ) {
      throw new Error("Instance signature mismatch");
    }
  }

  return siteId;
}

// Verify HubSpot webhook signature (v3)
export function verifyHubSpotWebhookSignature(
  rawBody: string,
  signature: string,
  requestUri: string,
  method: string,
): boolean {
  if (!config.HUBSPOT_WEBHOOK_SECRET) return true; // skip in dev if not set

  const payload = `${config.HUBSPOT_CLIENT_SECRET}${method.toUpperCase()}${requestUri}${rawBody}`;
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// Verify Wix webhook HMAC
export function verifyWixWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  if (!config.WIX_WEBHOOK_SECRET) return true;

  const hmac = crypto.createHmac("sha256", config.WIX_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expected = hmac.digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Auth for form submissions — accepts either a Wix instance token (dashboard)
// or the x-app-secret + x-wix-site-id headers (Wix backend hook, server-to-server).
export async function requireFormSubmissionAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const instance = (request.query as Record<string, string>)["instance"];
  if (instance) {
    return requireWixAuth(request, reply);
  }

  const secret = request.headers["x-app-secret"] as string | undefined;
  const siteId = request.headers["x-wix-site-id"] as string | undefined;

  if (secret && siteId && config.APP_SECRET) {
    const expected = Buffer.from(config.APP_SECRET);
    const actual = Buffer.from(secret);
    if (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    ) {
      (request as FastifyRequest & { wixSiteId: string }).wixSiteId = siteId;
      return;
    }
  }

  return reply.code(401).send({ error: "Authentication required" });
}

// Ensure site has an active HubSpot connection
export async function requireHubSpotConnection(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const wixSiteId = (request as FastifyRequest & { wixSiteId?: string })
    .wixSiteId;
  if (!wixSiteId) return reply.code(401).send({ error: "Not authenticated" });

  const connected = await isConnected(wixSiteId);
  if (!connected) {
    return reply
      .code(403)
      .send({ error: "HubSpot not connected for this site" });
  }
}
