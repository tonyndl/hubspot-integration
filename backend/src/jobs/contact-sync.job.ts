import { Worker, Job } from "bullmq";
import {
  redisConnection,
  QUEUE_CONTACT_SYNC,
  ContactSyncJobData,
} from "./queue.js";
import {
  syncWixContactToHubSpot,
  syncHubSpotContactToWix,
} from "../services/sync/engine.js";
import { logger } from "../utils/logger.js";

async function processContactSync(job: Job<ContactSyncJobData>): Promise<void> {
  const {
    wixSiteId,
    source,
    eventType,
    contactId,
    email,
    properties,
    inboundSyncId,
  } = job.data;

  logger.info(
    { jobId: job.id, wixSiteId, source, eventType, contactId },
    "Processing contact sync job",
  );

  if (source === "wix") {
    await syncWixContactToHubSpot(
      wixSiteId,
      {
        contactId,
        email,
        firstName: job.data.firstName,
        lastName: job.data.lastName,
        phone: job.data.phone,
        company: job.data.company,
        updatedAt: job.data.updatedAt,
      },
      eventType,
    );
  } else {
    await syncHubSpotContactToWix(
      wixSiteId,
      {
        contactId,
        email,
        properties: properties ?? {},
      },
      eventType,
      inboundSyncId,
    );
  }
}

export function startContactSyncWorker(): Worker<
  ContactSyncJobData,
  void,
  string
> {
  const worker = new Worker<ContactSyncJobData, void, string>(
    QUEUE_CONTACT_SYNC,
    processContactSync,
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "Contact sync job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Contact sync job failed");
  });

  logger.info("Contact sync worker started");
  return worker;
}
