import { Queue, Worker, QueueEvents } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ─── Redis connection options ─────────────────────────────────────────────────
// BullMQ v5 bundles its own ioredis — pass plain RedisOptions to avoid
// the version-mismatch type error that arises when a separate ioredis is installed.

function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "localhost",
      port: parseInt(u.port, 10) || 6379,
      password: u.password || undefined,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  }
}

export const redisConnection = parseRedisUrl(config.REDIS_URL);

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_CONTACT_SYNC = "contact-sync";
export const QUEUE_WEBHOOK = "webhook-process";

// ─── Job type definitions ─────────────────────────────────────────────────────

export interface ContactSyncJobData {
  wixSiteId: string;
  source: "wix" | "hubspot";
  eventType: "contact_created" | "contact_updated";
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  updatedAt?: string;
  properties?: Record<string, string>;
  inboundSyncId?: string;
}

export interface WebhookJobData {
  wixSiteId: string;
  source: "wix" | "hubspot";
  rawPayload: unknown;
  receivedAt: string;
}

// ─── Queue instances ──────────────────────────────────────────────────────────

export const contactSyncQueue = new Queue<ContactSyncJobData, void, string>(
  QUEUE_CONTACT_SYNC,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  },
);

export const webhookQueue = new Queue<WebhookJobData, void, string>(
  QUEUE_WEBHOOK,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "fixed", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  },
);

// ─── Queue events logging ─────────────────────────────────────────────────────

function attachQueueEvents(queueName: string) {
  const events = new QueueEvents(queueName, { connection: redisConnection });
  events.on("failed", ({ jobId, failedReason }) => {
    logger.error({ queueName, jobId, failedReason }, "Job failed");
  });
  events.on("stalled", ({ jobId }) => {
    logger.warn({ queueName, jobId }, "Job stalled");
  });
  return events;
}

export function initQueueEvents() {
  attachQueueEvents(QUEUE_CONTACT_SYNC);
  attachQueueEvents(QUEUE_WEBHOOK);
  logger.info("BullMQ queue events attached");
}
