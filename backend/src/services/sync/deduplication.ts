import { getSupabase } from "../../db/client.js";
import { logger } from "../../utils/logger.js";
import { SYNC_DEDUP_WINDOW_MS } from "../../config/index.js";

/**
 * Idempotency / deduplication layer.
 *
 * A sync_id is a correlation ID we embed in every write to a target system.
 * When that system fires a webhook back at us, we check whether the event's
 * correlation ID matches one of our own recent writes — if so, we skip it to
 * prevent the ping-pong loop.
 */

export async function markIdempotencyKey(
  wixSiteId: string,
  key: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + SYNC_DEDUP_WINDOW_MS * 2);

  await supabase.from("idempotency_keys").upsert(
    {
      key,
      wix_site_id: wixSiteId,
      result: result ?? {},
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "key" },
  );
}

export async function checkIdempotencyKey(key: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("idempotency_keys")
    .select("key, expires_at")
    .eq("key", key)
    .single();

  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) {
    // Expired — clean up and treat as not seen
    await supabase.from("idempotency_keys").delete().eq("key", data.key);
    return false;
  }
  return true;
}

// Build a deterministic key for a Wix→HubSpot write
export function wixToHubspotKey(
  wixSiteId: string,
  wixContactId: string,
  syncId: string,
) {
  return `wix:${wixSiteId}:${wixContactId}:${syncId}`;
}

// Build a deterministic key for a HubSpot→Wix write
export function hubspotToWixKey(
  wixSiteId: string,
  hubspotContactId: string,
  syncId: string,
) {
  return `hs:${wixSiteId}:${hubspotContactId}:${syncId}`;
}

// Sweep expired idempotency keys (run periodically)
export async function sweepExpiredKeys(): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("idempotency_keys")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("key");

  const count = data?.length ?? 0;
  if (count > 0) {
    logger.debug({ count }, "Swept expired idempotency keys");
  }
}
