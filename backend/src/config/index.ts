import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  BACKEND_URL: z.string().default("http://localhost:3001"),
  APP_SECRET: z.string().min(32),

  // Supabase
  DATABASE_URL: z.string(),
  SUPABASE_URL: z.string(),
  SUPABASE_SERVICE_KEY: z.string(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // HubSpot OAuth
  HUBSPOT_CLIENT_ID: z.string(),
  HUBSPOT_CLIENT_SECRET: z.string(),
  HUBSPOT_REDIRECT_URI: z.string(),
  HUBSPOT_WEBHOOK_SECRET: z
    .string()
    .transform((v) => v || undefined)
    .optional(),

  // Wix
  WIX_APP_ID: z.string(),
  WIX_APP_SECRET: z.string(),
  WIX_API_KEY: z
    .string()
    .transform((v) => v.trim() || undefined)
    .optional(),
  WIX_INSTANCE_ID: z.string().optional(), // app instanceId from Wix JWT (maps to WIX_META_SITE_ID)
  WIX_META_SITE_ID: z.string().optional(), // canonical site ID — used for wix-site-id header and all DB keys
  WIX_WEBHOOK_SECRET: z
    .string()
    .transform((v) => v || undefined)
    .optional(),

  // HubSpot Private App Token (used by the form widget submission endpoint)
  HUBSPOT_PRIVATE_APP_TOKEN: z
    .string()
    .transform((v) => v || undefined)
    .optional(),

  // Observability
  SENTRY_DSN: z
    .string()
    .transform((v) => v || undefined)
    .optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌  Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const config = parsed.data;

export const HUBSPOT_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
].join(" ");

export const SYNC_DEDUP_WINDOW_MS = 30_000; // 30 s dedup window
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000; // refresh 5 min before expiry
