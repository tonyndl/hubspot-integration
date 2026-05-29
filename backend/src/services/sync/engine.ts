import { v4 as uuidv4 } from "uuid";
import {
  getSupabase,
  ContactMappingRow,
  FieldMappingRow,
} from "../../db/client.js";
import { createHubSpotClient } from "../hubspot/client.js";
import { createWixClient } from "../wix/client.js";
import {
  upsertHubSpotContact,
  HubSpotContactProperties,
} from "../hubspot/contacts.js";
import {
  createWixContact,
  updateWixContact,
  getWixContact,
  findWixContactByEmail,
  WixContactInput,
} from "../wix/contacts.js";
import {
  checkIdempotencyKey,
  markIdempotencyKey,
  wixToHubspotKey,
  hubspotToWixKey,
  hsEventDedupKey,
} from "./deduplication.js";
import { logger } from "../../utils/logger.js";
import { SyncError } from "../../utils/errors.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncSource = "wix" | "hubspot";

export interface WixContactPayload {
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  updatedAt?: string;
  extendedFields?: Record<string, string>;
}

export interface HubSpotContactPayload {
  contactId: string;
  email: string;
  properties: HubSpotContactProperties;
}

// ─── Field mapping helpers ────────────────────────────────────────────────────

async function getActiveMappings(
  wixSiteId: string,
): Promise<FieldMappingRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("field_mappings")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .eq("is_active", true);
  return (data ?? []) as FieldMappingRow[];
}

function applyTransform(value: string, transform: string): string {
  switch (transform) {
    case "trim":
      return value.trim();
    case "lowercase":
      return value.toLowerCase();
    case "uppercase":
      return value.toUpperCase();
    default:
      return value;
  }
}

// Map Wix fields → HubSpot properties using saved field mappings only.
// Email is always included as the upsert key — everything else requires a mapping.
function mapWixToHubSpot(
  wixContact: WixContactPayload,
  mappings: FieldMappingRow[],
): HubSpotContactProperties {
  const result: HubSpotContactProperties = {};

  for (const m of mappings) {
    if (m.sync_direction === "hubspot_to_wix") continue;
    const rawValue = getWixFieldValue(wixContact, m.wix_field);
    if (rawValue !== undefined) {
      result[m.hubspot_property] = applyTransform(rawValue, m.transform);
    }
  }
  return result;
}

// Setters for standard Wix contact fields addressable by their API path
const WIX_FIELD_SETTERS: Record<
  string,
  (v: string, r: WixContactInput) => void
> = {
  "info.name.first": (v, r) => {
    r.firstName = v;
  },
  "info.name.last": (v, r) => {
    r.lastName = v;
  },
  "info.phones[0].phone": (v, r) => {
    r.phone = v;
  },
  "info.company.name": (v, r) => {
    r.company = v;
  },
  "info.emails[0].email": (v, r) => {
    r.email = v;
  },
};

// Map HubSpot properties → Wix fields using saved field mappings only.
// Email is always set (required for Wix contact identity).
function mapHubSpotToWix(
  hsProps: HubSpotContactProperties,
  mappings: FieldMappingRow[],
): WixContactInput & { extendedFields?: Record<string, unknown> } {
  const result: WixContactInput & { extendedFields?: Record<string, unknown> } =
    {
      email: hsProps.email ?? "",
    };

  const extended: Record<string, unknown> = {};
  for (const m of mappings) {
    if (m.sync_direction === "wix_to_hubspot") continue;
    const rawValue = hsProps[m.hubspot_property];
    if (rawValue !== undefined) {
      const transformed = applyTransform(rawValue, m.transform);
      if (m.wix_field.startsWith("custom.")) {
        // Extended / custom Wix fields
        extended[m.wix_field.replace("custom.", "")] = transformed;
      } else {
        // Standard built-in Wix field paths
        const setter = WIX_FIELD_SETTERS[m.wix_field];
        if (setter) setter(transformed, result);
      }
    }
  }
  if (Object.keys(extended).length) result.extendedFields = extended;
  return result;
}

function getWixFieldValue(
  contact: WixContactPayload,
  field: string,
): string | undefined {
  const map: Record<string, string | undefined> = {
    "info.name.first": contact.firstName,
    "info.name.last": contact.lastName,
    "info.emails[0].email": contact.email,
    "info.phones[0].phone": contact.phone,
    "info.company.name": contact.company,
    ...Object.fromEntries(
      Object.entries(contact.extendedFields ?? {}).map(([k, v]) => [
        `custom.${k}`,
        v,
      ]),
    ),
  };
  return map[field];
}

// ─── Contact mapping DB helpers ───────────────────────────────────────────────

async function getContactMapping(
  wixSiteId: string,
  field: "wix_contact_id" | "hubspot_contact_id",
  value: string,
): Promise<ContactMappingRow | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("contact_mappings")
    .select("*")
    .eq("wix_site_id", wixSiteId)
    .eq(field, value)
    .single<ContactMappingRow>();
  return data ?? null;
}

async function saveContactMapping(
  wixSiteId: string,
  wixContactId: string,
  hubspotContactId: string,
  source: SyncSource,
): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("contact_mappings").upsert(
    {
      wix_site_id: wixSiteId,
      wix_contact_id: wixContactId,
      hubspot_contact_id: hubspotContactId,
      last_synced_at: new Date().toISOString(),
      last_sync_source: source,
    },
    { onConflict: "wix_site_id,wix_contact_id" },
  );
}

async function writeSyncEvent(
  wixSiteId: string,
  eventType: string,
  source: SyncSource,
  syncId: string,
  wixContactId: string | null,
  hubspotContactId: string | null,
  status: "completed" | "failed",
  error?: string,
): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("sync_events").insert({
    wix_site_id: wixSiteId,
    event_type: eventType,
    source,
    sync_id: syncId,
    wix_contact_id: wixContactId,
    hubspot_contact_id: hubspotContactId,
    status,
    error: error ?? null,
    completed_at: new Date().toISOString(),
  });
}

// ─── Public sync functions ────────────────────────────────────────────────────

/**
 * Sync a Wix contact change → HubSpot
 *
 * Loop prevention:
 * 1. Generate a unique syncId before writing
 * 2. Embed syncId in the HubSpot write so the resulting webhook carries it
 * 3. When HubSpot webhook arrives, check if syncId matches one of our writes
 * 4. If yes — skip (it's our own echo)
 */
export async function syncWixContactToHubSpot(
  wixSiteId: string,
  wixContact: WixContactPayload,
  eventType: "contact_created" | "contact_updated",
): Promise<void> {
  const syncId = uuidv4();
  const idempotencyKey = wixToHubspotKey(
    wixSiteId,
    wixContact.contactId,
    syncId,
  );

  // Skip if already processed
  if (await checkIdempotencyKey(idempotencyKey)) {
    logger.debug(
      { wixSiteId, wixContactId: wixContact.contactId },
      "Dedup: skipping duplicate Wix→HubSpot sync",
    );
    return;
  }

  logger.info(
    { wixSiteId, wixContactId: wixContact.contactId, syncId, eventType, payload: wixContact },
    "Syncing Wix → HubSpot",
  );

  try {
    const hsClient = createHubSpotClient(wixSiteId);
    const mappings = await getActiveMappings(wixSiteId);
    const hsProps = mapWixToHubSpot(wixContact, mappings);

    logger.info(
      { wixSiteId, wixContactId: wixContact.contactId, mappedProperties: hsProps },
      "Wix → HubSpot mapped properties",
    );

    const { id: hubspotContactId } = await upsertHubSpotContact(
      hsClient,
      wixContact.email,
      hsProps,
      syncId,
    );

    await saveContactMapping(
      wixSiteId,
      wixContact.contactId,
      hubspotContactId,
      "wix",
    );
    await markIdempotencyKey(wixSiteId, idempotencyKey);
    await writeSyncEvent(
      wixSiteId,
      eventType,
      "wix",
      syncId,
      wixContact.contactId,
      hubspotContactId,
      "completed",
    );

    logger.info(
      { wixSiteId, wixContactId: wixContact.contactId, hubspotContactId },
      "Wix → HubSpot sync complete",
    );
  } catch (err) {
    await writeSyncEvent(
      wixSiteId,
      eventType,
      "wix",
      syncId,
      wixContact.contactId,
      null,
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    throw new SyncError("Wix → HubSpot sync failed", err);
  }
}

/**
 * Sync a HubSpot contact change → Wix
 *
 * Loop prevention:
 * 1. Each Wix write embeds hubspot_sync_id in extendedFields
 * 2. When Wix fires a webhook, we read hubspot_sync_id from the payload
 * 3. If it matches an active idempotency key — skip
 */
export async function syncHubSpotContactToWix(
  wixSiteId: string,
  hsPayload: HubSpotContactPayload,
  eventType: "contact_created" | "contact_updated",
  inboundSyncId?: string,
): Promise<void> {
  // Block duplicate webhook deliveries (HubSpot often sends the same event 2-3x).
  // Key is stable per contact+event — all duplicates share it; TTL 60s.
  const eventKey = hsEventDedupKey(wixSiteId, hsPayload.contactId, eventType);
  if (await checkIdempotencyKey(eventKey)) {
    logger.debug(
      { wixSiteId, hubspotContactId: hsPayload.contactId, eventType },
      "Dedup: skipping duplicate HubSpot webhook delivery",
    );
    return;
  }
  await markIdempotencyKey(wixSiteId, eventKey, {}, 60_000);

  const syncId = uuidv4();

  // If the inbound event carries a sync_id we generated, it's our own echo — skip
  if (inboundSyncId) {
    const echoKey = wixToHubspotKey(wixSiteId, "", inboundSyncId);
    if (await checkIdempotencyKey(echoKey)) {
      logger.debug(
        { wixSiteId, inboundSyncId },
        "Dedup: skipping HubSpot echo event",
      );
      return;
    }
  }

  const idempotencyKey = hubspotToWixKey(
    wixSiteId,
    hsPayload.contactId,
    syncId,
  );
  if (await checkIdempotencyKey(idempotencyKey)) {
    logger.debug(
      { wixSiteId, hubspotContactId: hsPayload.contactId },
      "Dedup: skipping duplicate HubSpot→Wix sync",
    );
    return;
  }

  logger.info(
    { wixSiteId, hubspotContactId: hsPayload.contactId, syncId, eventType, payload: hsPayload },
    "Syncing HubSpot → Wix",
  );

  try {
    const wixClient = createWixClient(wixSiteId);
    const mappings = await getActiveMappings(wixSiteId);
    const wixInput = mapHubSpotToWix(hsPayload.properties, mappings);

    logger.info(
      { wixSiteId, hubspotContactId: hsPayload.contactId, mappedInput: wixInput },
      "HubSpot → Wix mapped input",
    );
    wixInput.email = hsPayload.email;

    // Check if we already have a mapping for this HubSpot contact
    let mapping = await getContactMapping(
      wixSiteId,
      "hubspot_contact_id",
      hsPayload.contactId,
    );
    let wixContactId: string;

    if (mapping) {
      // Fetch current revision for the PATCH (Wix requires optimistic locking)
      const current = await getWixContact(wixClient, mapping.wix_contact_id);
      if (current) {
        await updateWixContact(
          wixClient,
          mapping.wix_contact_id,
          wixInput,
          syncId,
          current.revision,
        );
        wixContactId = mapping.wix_contact_id;
      } else {
        // Stale mapping — Wix contact was deleted; fall back to email lookup / create
        logger.warn(
          { wixSiteId, wixContactId: mapping.wix_contact_id },
          "Mapped Wix contact not found — falling back to email lookup",
        );
        const existing = await findWixContactByEmail(
          wixClient,
          hsPayload.email,
        );
        if (existing) {
          await updateWixContact(
            wixClient,
            existing.id,
            wixInput,
            syncId,
            existing.revision,
          );
          wixContactId = existing.id;
        } else {
          wixContactId = await createWixContact(wixClient, wixInput, syncId);
        }
      }
    } else {
      // Check if Wix contact exists by email before creating
      const existing = await findWixContactByEmail(wixClient, hsPayload.email);
      if (existing) {
        await updateWixContact(
          wixClient,
          existing.id,
          wixInput,
          syncId,
          existing.revision,
        );
        wixContactId = existing.id;
      } else {
        wixContactId = await createWixContact(wixClient, wixInput, syncId);
      }
    }

    await saveContactMapping(
      wixSiteId,
      wixContactId,
      hsPayload.contactId,
      "hubspot",
    );
    await markIdempotencyKey(wixSiteId, idempotencyKey);
    await writeSyncEvent(
      wixSiteId,
      eventType,
      "hubspot",
      syncId,
      wixContactId,
      hsPayload.contactId,
      "completed",
    );

    logger.info(
      { wixSiteId, wixContactId, hubspotContactId: hsPayload.contactId },
      "HubSpot → Wix sync complete",
    );
  } catch (err) {
    await writeSyncEvent(
      wixSiteId,
      eventType,
      "hubspot",
      syncId,
      null,
      hsPayload.contactId,
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    throw new SyncError("HubSpot → Wix sync failed", err);
  }
}

// Determine which version wins using "last updated wins" rule
export function resolveConflict(
  wixUpdatedAt: Date,
  hubspotUpdatedAt: Date,
): SyncSource {
  return wixUpdatedAt >= hubspotUpdatedAt ? "wix" : "hubspot";
}
