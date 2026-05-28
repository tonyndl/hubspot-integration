import { FastifyInstance, FastifyRequest } from "fastify";
import crypto from "crypto";
import axios from "axios";
import { z } from "zod";
import { config, HUBSPOT_SCOPES } from "../config/index.js";
import {
  saveTokens,
  deleteTokens,
  isConnected,
  getTokens,
} from "../services/token/manager.js";
import {
  OAuthCallbackQuerySchema,
  OAuthStateSchema,
} from "../schemas/index.js";
import { logger } from "../utils/logger.js";
import { requireWixAuth } from "../middleware/auth.js";
import { createHubSpotClient } from "../services/hubspot/client.js";
import { ensureUtmContactProperties } from "../services/hubspot/properties.js";

// In-memory CSRF nonce store (use Redis in multi-instance deployments)
const pendingStates = new Map<
  string,
  { wixSiteId: string; expiresAt: number }
>();

export async function oauthRoutes(fastify: FastifyInstance) {
  // ── GET /api/oauth/hubspot/status ───────────────────────────────────────
  fastify.get(
    "/api/oauth/hubspot/status",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const connected = await isConnected(wixSiteId);

      if (!connected) return reply.send({ connected: false });

      const tokens = await getTokens(wixSiteId);
      return reply.send({
        connected: true,
        portalId: tokens.portalId,
        hubDomain: tokens.hubDomain,
        scopes: tokens.scopes,
      });
    },
  );

  // ── GET /api/oauth/hubspot/authorize ────────────────────────────────────
  // Initiates the HubSpot OAuth flow. Called from the Wix dashboard.
  fastify.get(
    "/api/oauth/hubspot/authorize",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;

      const nonce = crypto.randomBytes(16).toString("hex");
      const state = Buffer.from(
        JSON.stringify({ wixSiteId, nonce } satisfies z.infer<
          typeof OAuthStateSchema
        >),
      ).toString("base64url");

      pendingStates.set(state, {
        wixSiteId,
        expiresAt: Date.now() + 10 * 60_000,
      });

      const authUrl = new URL("https://app.hubspot.com/oauth/authorize");
      authUrl.searchParams.set("client_id", config.HUBSPOT_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", config.HUBSPOT_REDIRECT_URI);
      authUrl.searchParams.set("scope", HUBSPOT_SCOPES);
      authUrl.searchParams.set("state", state);

      logger.info(
        {
          wixSiteId,
          authUrl: authUrl.toString(),
          scopes: HUBSPOT_SCOPES,
          redirectUri: config.HUBSPOT_REDIRECT_URI,
        },
        "HubSpot OAuth flow initiated",
      );
      return reply.send({ authUrl: authUrl.toString() });
    },
  );

  // ── GET /api/oauth/hubspot/callback ─────────────────────────────────────
  // HubSpot redirects here after the user grants permission.
  fastify.get("/api/oauth/hubspot/callback", async (request, reply) => {
    const { code, state } = OAuthCallbackQuerySchema.parse(request.query);

    const pending = pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingStates.delete(state);
      return reply.code(400).send({ error: "Invalid or expired OAuth state" });
    }
    pendingStates.delete(state);

    const { wixSiteId } = pending;

    try {
      // Exchange code for tokens
      const tokenRes = await axios.post<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        hub_id: number;
        hub_domain: string;
        token_type: string;
        user: string;
        scopes: string;
      }>(
        "https://api.hubapi.com/oauth/v1/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.HUBSPOT_CLIENT_ID,
          client_secret: config.HUBSPOT_CLIENT_SECRET,
          redirect_uri: config.HUBSPOT_REDIRECT_URI,
          code,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const {
        access_token,
        refresh_token,
        expires_in,
        hub_id,
        hub_domain,
        scopes,
      } = tokenRes.data;

      await saveTokens(
        wixSiteId,
        access_token,
        refresh_token,
        expires_in,
        String(hub_id),
        hub_domain,
        Array.isArray(scopes) ? scopes : scopes.split(" "),
      );

      logger.info(
        { wixSiteId, portalId: hub_id },
        "HubSpot OAuth complete — tokens saved",
      );

      // Ensure custom UTM contact properties exist (idempotent — safe to re-run)
      ensureUtmContactProperties(createHubSpotClient(wixSiteId)).catch((err) =>
        logger.warn(
          { err, wixSiteId },
          "UTM property setup failed (non-fatal)",
        ),
      );

      // Close the OAuth popup tab — the dashboard polls for connection status
      return reply.type("text/html").send(
        `<!doctype html><html><body><script>window.close();</script>
        <p>Connected! You can close this tab.</p></body></html>`,
      );
    } catch (err) {
      logger.error({ err, wixSiteId }, "OAuth token exchange failed");
      return reply.type("text/html").send(
        `<!doctype html><html><body><script>window.close();</script>
        <p>Authorization failed. Please close this tab and try again.</p></body></html>`,
      );
    }
  });

  // ── DELETE /api/oauth/hubspot/disconnect ────────────────────────────────
  fastify.delete(
    "/api/oauth/hubspot/disconnect",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      await deleteTokens(wixSiteId);
      logger.info({ wixSiteId }, "HubSpot disconnected");
      return reply.send({ disconnected: true });
    },
  );
}
