import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// Supabase typed client (service role — server-side only, never exposed to browser)
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: ws as any },
    });
    logger.info("Supabase client initialised");
  }
  return _supabase;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export interface OAuthTokenRow {
  id: string;
  wix_site_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  hubspot_portal_id: string | null;
  hubspot_hub_domain: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactMappingRow {
  id: string;
  wix_site_id: string;
  wix_contact_id: string;
  hubspot_contact_id: string;
  last_synced_at: string | null;
  last_sync_source: "wix" | "hubspot" | null;
  created_at: string;
  updated_at: string;
}

export interface FieldMappingRow {
  id: string;
  wix_site_id: string;
  wix_field: string;
  hubspot_property: string;
  sync_direction: "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
  transform: "none" | "trim" | "lowercase" | "uppercase";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncEventRow {
  id: string;
  wix_site_id: string;
  event_type: string;
  source: "wix" | "hubspot";
  sync_id: string;
  wix_contact_id: string | null;
  hubspot_contact_id: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface IdempotencyKeyRow {
  key: string;
  wix_site_id: string;
  result: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
}

export interface FormSubmissionRow {
  id: string;
  wix_site_id: string;
  form_id: string | null;
  hubspot_contact_id: string | null;
  email: string;
  data: Record<string, unknown>;
  utm_data: Record<string, unknown>;
  page_url: string | null;
  referrer: string | null;
  status: "pending" | "completed" | "failed";
  error: string | null;
  created_at: string;
}
