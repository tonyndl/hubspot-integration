import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import * as Sentry from "@sentry/node";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { isAppError } from "./utils/errors.js";
import { oauthRoutes } from "./routes/oauth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { fieldMappingRoutes } from "./routes/field-mapping.js";
import { formsRoutes } from "./routes/forms.js";
import { contactsRoutes } from "./routes/contacts.js";
import { adminRoutes } from "./routes/admin.js";
import { formSubmitRoute } from "./routes/form-submit.js";
import { startContactSyncWorker } from "./jobs/contact-sync.job.js";
import { startWebhookWorker } from "./jobs/webhook.job.js";
import { initQueueEvents } from "./jobs/queue.js";
import { sweepExpiredKeys } from "./services/sync/deduplication.js";
import { pollAllConnectedSites } from "./services/sync/poller.js";
import cron from "node-cron";

// ─── Sentry ───────────────────────────────────────────────────────────────────
if (config.SENTRY_DSN) {
  Sentry.init({ dsn: config.SENTRY_DSN, environment: config.NODE_ENV });
  logger.info("Sentry initialised");
}

// ─── Fastify server ───────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: false, // We use Pino directly
  trustProxy: true,
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Public form submission endpoint must work from any Wix-hosted site.
    // All sensitive routes are protected by requireWixAuth middleware, so
    // CORS is not the primary security boundary for those endpoints.
    cb(null, true);
  },
  credentials: true,
});
await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: "1 minute",
});

// Store raw body for webhook signature verification
fastify.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    if (!body || (body as string).trim() === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

// ─── Routes ───────────────────────────────────────────────────────────────────

await fastify.register(oauthRoutes);
await fastify.register(webhookRoutes);
await fastify.register(fieldMappingRoutes);
await fastify.register(formsRoutes);
await fastify.register(contactsRoutes);
await fastify.register(adminRoutes);
await fastify.register(formSubmitRoute);

// Health check
fastify.get("/health", async () => ({
  status: "ok",
  ts: new Date().toISOString(),
}));

// ─── Global error handler ─────────────────────────────────────────────────────

fastify.setErrorHandler((error, _request, reply) => {
  if (config.SENTRY_DSN) Sentry.captureException(error);

  if (isAppError(error)) {
    logger.warn({ code: error.code, message: error.message }, "App error");
    return reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  logger.error({ err: error }, "Unhandled server error");
  return reply.code(500).send({ error: "Internal server error" });
});

// ─── Workers ──────────────────────────────────────────────────────────────────

initQueueEvents();
const contactSyncWorker = startContactSyncWorker();
const webhookWorker = startWebhookWorker();

// Sweep expired idempotency keys every 10 minutes
cron.schedule("*/10 * * * *", () => sweepExpiredKeys());

// Poll both HubSpot and Wix for changes every 30 seconds.
// Also fires immediately on startup so there's no wait after a restart.
const runPoll = () =>
  pollAllConnectedSites().catch((err) => logger.error({ err }, "Poll failed"));
runPoll();
setInterval(runPoll, 30_000);

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await fastify.listen({ port: config.PORT, host: config.HOST });
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      "Server listening",
    );
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down");
  await Promise.all([contactSyncWorker.close(), webhookWorker.close()]);
  await fastify.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
