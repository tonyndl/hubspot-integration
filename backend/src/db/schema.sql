-- ============================================================
-- Wix ↔ HubSpot Integration — PostgreSQL Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── OAuth Tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id            TEXT        NOT NULL UNIQUE,
  access_token_encrypted TEXT        NOT NULL,
  refresh_token_encrypted TEXT       NOT NULL,
  token_expires_at       TIMESTAMPTZ NOT NULL,
  hubspot_portal_id      TEXT,
  hubspot_hub_domain     TEXT,
  scopes                 TEXT[]      DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Contact ID Mappings ───────────────────────────────────────────────────
-- Core loop-prevention table: one row per synced contact pair
CREATE TABLE IF NOT EXISTS contact_mappings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id         TEXT        NOT NULL,
  wix_contact_id      TEXT        NOT NULL,
  hubspot_contact_id  TEXT        NOT NULL,
  last_synced_at      TIMESTAMPTZ,
  -- tracks which system last wrote, used for conflict resolution
  last_sync_source    TEXT        CHECK (last_sync_source IN ('wix', 'hubspot')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wix_site_id, wix_contact_id),
  UNIQUE(wix_site_id, hubspot_contact_id)
);

-- ─── Field Mappings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_mappings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id       TEXT        NOT NULL,
  wix_field         TEXT        NOT NULL,
  hubspot_property  TEXT        NOT NULL,
  sync_direction    TEXT        NOT NULL
                    CHECK (sync_direction IN ('wix_to_hubspot','hubspot_to_wix','bidirectional')),
  transform         TEXT        NOT NULL DEFAULT 'none'
                    CHECK (transform IN ('none','trim','lowercase','uppercase')),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one mapping per HubSpot property per site
  UNIQUE(wix_site_id, hubspot_property)
);

-- ─── Sync Events (observability + deduplication) ───────────────────────────
CREATE TABLE IF NOT EXISTS sync_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id          TEXT        NOT NULL,
  event_type           TEXT        NOT NULL,   -- contact_created | contact_updated
  source               TEXT        NOT NULL    CHECK (source IN ('wix','hubspot')),
  -- correlation ID set by us before writing to target system
  sync_id              TEXT        NOT NULL UNIQUE,
  wix_contact_id       TEXT,
  hubspot_contact_id   TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed')),
  error                TEXT,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

-- ─── Idempotency Keys (dedup window) ──────────────────────────────────────
-- A row here means "we already processed this event"
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT        PRIMARY KEY,
  wix_site_id  TEXT        NOT NULL,
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- ─── Form Submissions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id         TEXT        NOT NULL,
  form_id             TEXT,
  hubspot_contact_id  TEXT,
  email               TEXT        NOT NULL,
  data                JSONB       NOT NULL DEFAULT '{}',
  utm_data            JSONB       NOT NULL DEFAULT '{}',
  page_url            TEXT,
  referrer            TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','failed')),
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Bulk Sync Jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulk_sync_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_site_id   TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total         INTEGER     NOT NULL DEFAULT 0,
  synced        INTEGER     NOT NULL DEFAULT 0,
  failed_count  INTEGER     NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contact_mappings_wix
  ON contact_mappings(wix_site_id, wix_contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_mappings_hubspot
  ON contact_mappings(wix_site_id, hubspot_contact_id);

CREATE INDEX IF NOT EXISTS idx_sync_events_site_created
  ON sync_events(wix_site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_source
  ON sync_events(source, wix_site_id);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_field_mappings_site
  ON field_mappings(wix_site_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_form_submissions_site
  ON form_submissions(wix_site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_sync_jobs_site
  ON bulk_sync_jobs(wix_site_id, created_at DESC);

-- ─── Auto-update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_oauth_tokens_updated_at ON oauth_tokens;
CREATE TRIGGER set_oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_contact_mappings_updated_at ON contact_mappings;
CREATE TRIGGER set_contact_mappings_updated_at
  BEFORE UPDATE ON contact_mappings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_field_mappings_updated_at ON field_mappings;
CREATE TRIGGER set_field_mappings_updated_at
  BEFORE UPDATE ON field_mappings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
