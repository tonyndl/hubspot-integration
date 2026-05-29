-- ============================================================
-- Supabase Table Cleaner
-- Run in: Supabase Dashboard → SQL Editor
-- Uncomment the lines you want to execute.
-- ============================================================

-- Safe to clear any time (logs / cache)
TRUNCATE TABLE sync_events        RESTART IDENTITY CASCADE;
TRUNCATE TABLE form_submissions   RESTART IDENTITY CASCADE;
TRUNCATE TABLE bulk_sync_jobs     RESTART IDENTITY CASCADE;
TRUNCATE TABLE idempotency_keys   RESTART IDENTITY CASCADE;

-- Clears sync history (contacts stay in Wix & HubSpot, just un-linked)
-- TRUNCATE TABLE contact_mappings   RESTART IDENTITY CASCADE;

-- Clears your field mapping config
-- TRUNCATE TABLE field_mappings      RESTART IDENTITY CASCADE;

-- ⚠ Disconnects ALL HubSpot accounts — comment out unless you're sure
-- TRUNCATE TABLE oauth_tokens        RESTART IDENTITY CASCADE;
