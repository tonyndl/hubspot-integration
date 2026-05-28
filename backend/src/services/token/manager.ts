import crypto from "crypto";
import axios from "axios";
import { config, TOKEN_REFRESH_BUFFER_MS } from "../../config/index.js";
import { getSupabase, OAuthTokenRow } from "../../db/client.js";
import { logger } from "../../utils/logger.js";
import { OAuthError, NotFoundError } from "../../utils/errors.js";

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.scryptSync(config.APP_SECRET, "wix-hubspot-salt", 32);

// ─── Encryption helpers (tokens at rest) ─────────────────────────────────────

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  portalId: string | null;
  hubDomain: string | null;
  scopes: string[];
}

export async function saveTokens(
  wixSiteId: string,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  portalId?: string,
  hubDomain?: string,
  scopes?: string[],
): Promise<void> {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const { error } = await supabase.from("oauth_tokens").upsert(
    {
      wix_site_id: wixSiteId,
      access_token_encrypted: encrypt(accessToken),
      refresh_token_encrypted: encrypt(refreshToken),
      token_expires_at: expiresAt.toISOString(),
      hubspot_portal_id: portalId ?? null,
      hubspot_hub_domain: hubDomain ?? null,
      scopes: scopes ?? [],
    },
    { onConflict: "wix_site_id" },
  );

  if (error) {
    logger.error({ err: error, wixSiteId }, "Failed to save tokens");
    throw new OAuthError("Failed to persist OAuth tokens");
  }

  logger.info({ wixSiteId, portalId }, "OAuth tokens saved");
}

export async function getTokens(wixSiteId: string): Promise<StoredTokens> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .single<OAuthTokenRow>();

  if (error || !data) {
    throw new NotFoundError(`HubSpot connection for site ${wixSiteId}`);
  }

  return {
    accessToken: decrypt(data.access_token_encrypted),
    refreshToken: decrypt(data.refresh_token_encrypted),
    expiresAt: new Date(data.token_expires_at),
    portalId: data.hubspot_portal_id,
    hubDomain: data.hubspot_hub_domain,
    scopes: data.scopes,
  };
}

export async function getValidAccessToken(wixSiteId: string): Promise<string> {
  const tokens = await getTokens(wixSiteId);
  const needsRefresh =
    tokens.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return tokens.accessToken;
  }

  logger.info({ wixSiteId }, "Access token expiring soon — refreshing");
  return refreshAccessToken(wixSiteId, tokens.refreshToken);
}

export async function refreshAccessToken(
  wixSiteId: string,
  refreshToken: string,
): Promise<string> {
  try {
    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.HUBSPOT_CLIENT_ID,
        client_secret: config.HUBSPOT_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const existing = await getTokens(wixSiteId);

    await saveTokens(
      wixSiteId,
      access_token,
      refresh_token,
      expires_in,
      existing.portalId ?? undefined,
      existing.hubDomain ?? undefined,
      existing.scopes,
    );

    logger.info({ wixSiteId }, "Access token refreshed successfully");
    return access_token;
  } catch (err) {
    logger.error({ err, wixSiteId }, "Token refresh failed");
    throw new OAuthError("Failed to refresh HubSpot access token");
  }
}

export async function deleteTokens(wixSiteId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("oauth_tokens")
    .delete()
    .eq("wix_site_id", wixSiteId);

  if (error) {
    logger.error({ err: error, wixSiteId }, "Failed to delete tokens");
    throw new OAuthError("Failed to revoke HubSpot connection");
  }

  logger.info({ wixSiteId }, "HubSpot tokens deleted (disconnected)");
}

export async function isConnected(wixSiteId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("oauth_tokens")
    .select("wix_site_id")
    .eq("wix_site_id", wixSiteId)
    .single();
  return !!data;
}
