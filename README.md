WIX Credentials: email: tonyndlovu1234@gmail.com   password: Qawsed4321#
Test on MY_SITE_1


Features
Bi-directional sync — contacts flow Wix → HubSpot and HubSpot → Wix
Real-time — contact changes sync within 30 seconds via polling; Wix contact hooks fire immediately on create/update
Multi-tenant — each Wix site connects its own HubSpot account via OAuth; data is fully isolated per site
Field mapping — configurable per-site mapping between Wix contact fields and HubSpot properties
Sync All — one-click backfill of all existing contacts in both directions
Sync Activity — live dashboard showing every sync event with status, direction, and error details
Loop prevention — deduplication layer prevents ping-pong syncing when a contact update triggers a webhook from the other side
Form submissions — Wix form submissions forwarded to HubSpot with UTM attribution


ARCHITECTURE
Wix Site (any)
  ├── Dashboard App (React)           — field mapping, sync activity, HubSpot connect
  └── Backend Hooks (contacts.web.ts) — fires on contact create/update → calls Railway

Railway (Node.js / Fastify)
  ├── /api/oauth/hubspot/*            — HubSpot OAuth flow per site
  ├── /api/webhooks/hubspot           — receives HubSpot contact webhooks
  ├── /api/webhooks/wix-contact       — receives Wix contact hook calls
  ├── /api/contacts/*                 — sync status, mappings, bulk sync
  ├── /api/field-mappings             — per-site field mapping CRUD
  └── Poller (every 30s)              — polls both APIs for missed changes

BullMQ / Redis                        — async job queue for contact sync jobs
Supabase (PostgreSQL)                 — oauth tokens, contact mappings, sync events


TECH STACK
Layer	Technology
Wix App	Wix App Framework (CLI), React, Wix Design System
Backend	Node.js, Fastify, TypeScript
Database	Supabase (PostgreSQL)
Queue	BullMQ + Redis
Hosting	Railway
