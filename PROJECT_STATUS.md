# SPA System — Project Status

## Live URL
https://spa-app-orpin.vercel.app

## Stack
- Frontend: index.html (single file, Vercel)
- Backend: Node.js + Express (Vercel serverless)
- DB: Supabase (PostgreSQL)
- Auth: JWT

## DB State (as of 12-Apr-2026)
- users: 74 rows (TM list imported)
- dealers: 306 rows
- price_requests: 38 columns, 0 rows
- escalation_rules: 4 rows
- approval_history: 0 rows
- Schema has: validity_days, deal_stage, confirmed_at, lapse_deadline, zone, manager_id

## Phase Status
- [x] Phase 1 — DB schema migrations (validity, zones, manager_id FK, deal_stage)
- [x] Phase 1 — TM/user list imported (74 users)
- [x] Phase 1 — Dealer list imported (306 rows)
- [ ] Phase 2 — Admin user management panel (UI)
- [ ] Phase 2 — Bulk CSV import flow
- [ ] Phase 2 — Zone-aware routing logic (TM/RSM/ZSM see only their zone)
- [ ] Phase 3 — Validity days on submission form
- [ ] Phase 3 — Deal confirmation flow (14-day window, auto-lapse)
- [ ] Phase 3 — Expiry alert + re-raise
- [ ] Phase 4 — Clean test data, zone filters, QA, go-live

## Key Decisions Locked
- Validity: set by TM in days (max 365), clock starts on deal confirmation
- Confirmation window: 14 days post-approval, else auto-lapse
- User import: manual CSV via admin panel
- Zones: North, South, East, West (all India)

## Current Blocker
Phase 2 start — v4_migration.sql connection issue (run manually via Supabase SQL Editor)

## Instructions for Claude Code — read this at session start
This is the SPA Special Price Approval system for Coloplast India. Always read this file first before any task.
