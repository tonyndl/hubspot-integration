/**
 * Wix CRM contact event hooks — fires when contacts are created/updated.
 * Posts to the backend which enqueues the HubSpot sync job.
 */

const BACKEND_URL = "https://hubspot-integration-production-d45f.up.railway.app";

// metaSiteId from .wix/app.config.json — what getSiteInfo().siteId returns
const WIX_SITE_ID = "56993fb3-9fa1-4615-9387-8180d9c04a7e";

interface WixContactEvent {
  entity?: {
    id?: string;
    primaryInfo?: { email?: string; phone?: string };
    name?: { first?: string; last?: string };
    info?: {
      name?: { first?: string; last?: string };
      emails?: { items?: Array<{ email?: string; primary?: boolean }> };
      phones?: { items?: Array<{ phone?: string; primary?: boolean }> };
      company?: { name?: string };
    };
    phones?: Array<{ phone?: string }>;
  };
  metadata?: { entityId?: string };
}

function extractEmail(entity: NonNullable<WixContactEvent["entity"]>): string {
  return (
    entity.primaryInfo?.email ??
    entity.info?.emails?.items?.find((e) => e.primary)?.email ??
    entity.info?.emails?.items?.[0]?.email ??
    ""
  );
}

function extractPhone(
  entity: NonNullable<WixContactEvent["entity"]>,
): string | undefined {
  return (
    entity.primaryInfo?.phone ??
    entity.info?.phones?.items?.find((p) => p.primary)?.phone ??
    entity.info?.phones?.items?.[0]?.phone ??
    entity.phones?.[0]?.phone
  );
}

async function notifyBackend(
  eventType: "contact_created" | "contact_updated",
  event: WixContactEvent,
): Promise<void> {
  const entity = event.entity ?? {};
  const contactId = entity.id ?? event.metadata?.entityId ?? "";
  const email = extractEmail(entity);

  if (!email) {
    console.log(`[HubSpot] skip ${eventType} ${contactId} — no email`);
    return;
  }

  const body = {
    wixSiteId: WIX_SITE_ID,
    source: "wix",
    eventType,
    contactId,
    email,
    firstName: entity.name?.first ?? entity.info?.name?.first,
    lastName: entity.name?.last ?? entity.info?.name?.last,
    phone: extractPhone(entity),
    company: entity.info?.company?.name,
  };

  console.log(`[HubSpot] ${eventType} ${email}`);

  try {
    const res = await fetch(`${BACKEND_URL}/api/webhooks/wix-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`[HubSpot] backend responded ${res.status}`);
  } catch (err) {
    console.error("[HubSpot] notify failed:", err);
  }
}

export function wixCrm_onContactCreated(event: WixContactEvent): Promise<void> {
  return notifyBackend("contact_created", event);
}

export function wixCrm_onContactUpdated(event: WixContactEvent): Promise<void> {
  return notifyBackend("contact_updated", event);
}
