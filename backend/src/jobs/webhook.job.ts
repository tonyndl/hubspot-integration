import { Worker, Job } from "bullmq";
import {
  redisConnection,
  QUEUE_WEBHOOK,
  WebhookJobData,
  contactSyncQueue,
} from "./queue.js";
import { getSupabase } from "../db/client.js";
import { getHubSpotContact } from "../services/hubspot/contacts.js";
import { createHubSpotClient } from "../services/hubspot/client.js";
import {
  HubSpotWebhookBodySchema,
  WixWebhookSchema,
} from "../schemas/index.js";
import { logger } from "../utils/logger.js";

async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const { wixSiteId, source, rawPayload } = job.data;

  if (source === "hubspot") {
    await handleHubSpotWebhook(wixSiteId, rawPayload);
  } else {
    await handleWixWebhook(wixSiteId, rawPayload);
  }
}

async function handleHubSpotWebhook(
  wixSiteId: string,
  rawPayload: unknown,
): Promise<void> {
  const events = HubSpotWebhookBodySchema.parse(rawPayload);

  // Deduplicate by objectId — multiple property-change events for same contact
  const uniqueContacts = new Map<number, (typeof events)[0]>();
  for (const event of events) {
    if (
      event.eventType === "contact.creation" ||
      event.eventType === "contact.propertyChange"
    ) {
      // Keep the latest event for each contact
      const existing = uniqueContacts.get(event.objectId);
      if (!existing || event.occurredAt > existing.occurredAt) {
        uniqueContacts.set(event.objectId, event);
      }
    }
  }

  const hsClient = createHubSpotClient(wixSiteId);

  for (const [, event] of uniqueContacts) {
    const hsContactId = String(event.objectId);
    const eventType =
      event.eventType === "contact.creation"
        ? "contact_created"
        : "contact_updated";

    // Fetch full contact to get email and all properties
    const contact = await getHubSpotContact(hsClient, hsContactId);
    if (!contact || !contact.properties.email) {
      logger.warn(
        { hsContactId },
        "HubSpot contact not found or missing email — skipping",
      );
      continue;
    }

    await contactSyncQueue.add(
      `hs-${hsContactId}-${event.occurredAt}`,
      {
        wixSiteId,
        source: "hubspot",
        eventType,
        contactId: hsContactId,
        email: contact.properties.email,
        properties: contact.properties as Record<string, string>,
        updatedAt: contact.updatedAt,
      },
      { jobId: `hs-sync-${wixSiteId}-${hsContactId}-${event.occurredAt}` },
    );

    logger.info(
      { wixSiteId, hsContactId, eventType },
      "Enqueued HubSpot → Wix contact sync",
    );
  }
}

async function handleWixWebhook(
  wixSiteId: string,
  rawPayload: unknown,
): Promise<void> {
  const event = WixWebhookSchema.parse(rawPayload);
  const data = JSON.parse(event.data) as {
    contactId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    updatedDate?: string;
    extendedFields?: { items?: Record<string, unknown> };
  };

  // Read the sync_id we embedded — if present, this is our own echo
  const embeddedSyncId = data.extendedFields?.items?.hubspot_sync_id as
    | string
    | undefined;
  const email = data.email;

  if (!email) {
    logger.warn(
      { wixSiteId, contactId: data.contactId },
      "Wix webhook missing email — skipping",
    );
    return;
  }

  const eventType = event.eventType.includes("Created")
    ? "contact_created"
    : "contact_updated";

  await contactSyncQueue.add(
    `wix-${data.contactId}-${Date.now()}`,
    {
      wixSiteId,
      source: "wix",
      eventType,
      contactId: data.contactId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      updatedAt: data.updatedDate,
      inboundSyncId: embeddedSyncId,
    },
    { jobId: `wix-sync-${wixSiteId}-${data.contactId}-${Date.now()}` },
  );

  logger.info(
    { wixSiteId, contactId: data.contactId, eventType },
    "Enqueued Wix → HubSpot contact sync",
  );
}

export function startWebhookWorker(): Worker<WebhookJobData, void, string> {
  const worker = new Worker<WebhookJobData, void, string>(
    QUEUE_WEBHOOK,
    processWebhook,
    {
      connection: redisConnection,
      concurrency: 10,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Webhook job failed");
  });

  logger.info("Webhook worker started");
  return worker;
}
