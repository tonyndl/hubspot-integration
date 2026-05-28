import { getSupabase } from "../../db/client.js";
import { createHubSpotClient } from "../hubspot/client.js";
import { createWixClient } from "../wix/client.js";
import { searchRecentlyModifiedContacts } from "../hubspot/contacts.js";
import { searchRecentlyModifiedWixContacts } from "../wix/contacts.js";
import { contactSyncQueue } from "../../jobs/queue.js";
import { logger } from "../../utils/logger.js";

// Per-site watermarks — reset to (now - 5 min) on startup to catch missed events
const hsWatermarks = new Map<string, number>();
const wixWatermarks = new Map<string, number>();

function getWatermark(map: Map<string, number>, key: string): number {
  return map.get(key) ?? Date.now() - 5 * 60_000;
}

// Echo prevention window: covers both real-time syncs (single contact) and bulk
// sync jobs (which can take several minutes for large contact lists).
const ECHO_WINDOW_MS = 10 * 60_000;

async function getRecentlySyncedIds(
  wixSiteId: string,
  idField: "hubspot_contact_id" | "wix_contact_id",
  ids: string[],
  source: "wix" | "hubspot",
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const supabase = getSupabase();
  const since = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("contact_mappings")
    .select(idField)
    .eq("wix_site_id", wixSiteId)
    .eq("last_sync_source", source)
    .gte("last_synced_at", since)
    .in(idField, ids);
  return new Set((data ?? []).map((r) => r[idField] as string));
}

// Returns the set of IDs that already have a mapping (i.e. previously synced contacts).
async function getMappedIds(
  wixSiteId: string,
  idField: "hubspot_contact_id" | "wix_contact_id",
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const supabase = getSupabase();
  const { data } = await supabase
    .from("contact_mappings")
    .select(idField)
    .eq("wix_site_id", wixSiteId)
    .in(idField, ids);
  return new Set((data ?? []).map((r) => r[idField] as string));
}

// ── HubSpot → Wix ─────────────────────────────────────────────────────────────

async function pollHubSpot(wixSiteId: string): Promise<void> {
  const since = getWatermark(hsWatermarks, wixSiteId);
  const pollStart = Date.now();

  const client = createHubSpotClient(wixSiteId);
  const contacts = await searchRecentlyModifiedContacts(client, since);
  if (!contacts.length) {
    hsWatermarks.set(wixSiteId, pollStart);
    return;
  }

  // Skip contacts that were recently synced FROM Wix (they're just our own echo)
  const hsIds = contacts.map((c) => c.id);
  const [recentFromWix, mappedHsIds] = await Promise.all([
    getRecentlySyncedIds(wixSiteId, "hubspot_contact_id", hsIds, "wix"),
    getMappedIds(wixSiteId, "hubspot_contact_id", hsIds),
  ]);

  let enqueued = 0;
  for (const contact of contacts) {
    if (recentFromWix.has(contact.id)) continue;

    const email = contact.properties.email;
    if (!email) continue;

    const safeProps = Object.fromEntries(
      Object.entries(contact.properties).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;

    const eventType = mappedHsIds.has(contact.id)
      ? "contact_updated"
      : "contact_created";

    await contactSyncQueue.add(
      `hs-poll-${wixSiteId}-${contact.id}`,
      {
        wixSiteId,
        source: "hubspot",
        eventType,
        contactId: contact.id,
        email,
        properties: safeProps,
      },
      {
        jobId: `hs-poll-${wixSiteId}-${contact.id}-${Math.floor(since / 60000)}`,
      },
    );
    enqueued++;
  }

  if (enqueued > 0) {
    logger.info(
      { wixSiteId, enqueued, skipped: contacts.length - enqueued },
      "HubSpot poll: enqueued for sync",
    );
  }
  hsWatermarks.set(wixSiteId, pollStart);
}

// ── Wix → HubSpot ─────────────────────────────────────────────────────────────

async function pollWix(wixSiteId: string): Promise<void> {
  const since = getWatermark(wixWatermarks, wixSiteId);
  const pollStart = Date.now();

  const client = createWixClient(wixSiteId);
  const contacts = await searchRecentlyModifiedWixContacts(client, since);
  if (!contacts.length) {
    wixWatermarks.set(wixSiteId, pollStart);
    return;
  }

  // Skip contacts that were recently synced FROM HubSpot (they're just our own echo)
  const wixIds = contacts.map((c) => c.id);
  const [recentFromHs, mappedWixIds] = await Promise.all([
    getRecentlySyncedIds(wixSiteId, "wix_contact_id", wixIds, "hubspot"),
    getMappedIds(wixSiteId, "wix_contact_id", wixIds),
  ]);

  let enqueued = 0;
  for (const contact of contacts) {
    if (recentFromHs.has(contact.id)) continue;

    const email =
      contact.primaryEmail?.email ??
      contact.info?.emails?.items?.find((e) => e.primary)?.email ??
      contact.info?.emails?.items?.[0]?.email;

    if (!email) continue;

    const eventType = mappedWixIds.has(contact.id)
      ? "contact_updated"
      : "contact_created";

    await contactSyncQueue.add(
      `wix-poll-${wixSiteId}-${contact.id}`,
      {
        wixSiteId,
        source: "wix",
        eventType,
        contactId: contact.id,
        email,
        firstName: contact.info?.name?.first,
        lastName: contact.info?.name?.last,
        phone: contact.info?.phones?.items?.[0]?.phone,
        company: contact.info?.company?.name,
        updatedAt: contact.updatedDate,
      },
      {
        jobId: `wix-poll-${wixSiteId}-${contact.id}-${Math.floor(since / 60000)}`,
      },
    );
    enqueued++;
  }

  if (enqueued > 0) {
    logger.info(
      { wixSiteId, enqueued, skipped: contacts.length - enqueued },
      "Wix poll: enqueued for sync",
    );
  }
  wixWatermarks.set(wixSiteId, pollStart);
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function pollAllConnectedSites(): Promise<void> {
  const supabase = getSupabase();
  const { data: sites } = await supabase
    .from("oauth_tokens")
    .select("wix_site_id, hubspot_portal_id");

  if (!sites?.length) return;

  await Promise.allSettled(
    sites.map(async ({ wix_site_id: wixSiteId }) => {
      await Promise.allSettled([
        pollHubSpot(wixSiteId).catch((err) =>
          logger.error({ err, wixSiteId }, "HubSpot poll failed"),
        ),
        pollWix(wixSiteId).catch((err) =>
          logger.error({ err, wixSiteId }, "Wix poll failed"),
        ),
      ]);
    }),
  );
}
