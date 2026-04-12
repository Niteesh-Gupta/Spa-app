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
- [x] Phase 2 — Bulk CSV import flow
- [x] Phase 2 — All India user seeding (73 users: 58 TM, 11 RSM, 3 ZSM, 1 NSM)
- [x] Phase 2 — Zone-aware routing logic (backend filter live; frontend display fixed)
- [x] Phase 3 — Validity days on submission form
- [x] Phase 3 — Deal confirmation flow (14-day window, auto-lapse)
- [x] Phase 3 — Expiry alert + re-raise (lapse cron live; re-raise UI present for TMs)
- [ ] Phase 4 — Run 006_clean_test_data.sql (pre go-live)
- [ ] Phase 4 — Run migration-002 SQL (dealer/SKU columns on price_requests)
- [ ] Phase 4 — Communicate credentials to 73 users (Password@123)
- [ ] Phase 4 — Go-live announcement
- [ ] Phase 4 — Monitor first 5 real requests end-to-end

## Key Decisions Locked
- Validity: set by TM in days (max 365), clock starts on deal confirmation
- Confirmation window: 14 days post-approval, else auto-lapse
- User import: manual CSV via admin panel
- Zones: North, South, East, West (all India)

## Phase 3 Notes
- PATCH /api/requests/:id/confirm live. Lapse check cron runs daily at 01:00 UTC via vercel.json.

## User Hierarchy Notes
- 73 users imported (58 TM, 11 RSM, 3 ZSM, 1 NSM)
- West ZSM vacant — West RSMs (injj, inpps, inpjm) report to NSM directly
- East ZSM = insdc@coloplast.com (dual role: also RSM East)

## Current Blocker
Phase 2 start — v4_migration.sql connection issue (run manually via Supabase SQL Editor)

## Governance Fixes (12-Apr-2026)
- [x] Status values standardized to Title case across all files
- [x] _zone session restore fixed (survives page refresh)
- [x] f-zone null reference removed from TM form
- [x] /api/admin/migrate disabled in production (403)
- [x] Dealer autocomplete from DB (306 dealers)
- [ ] Hospital free-text → lookup
- [ ] Audit trail for all status changes
- [ ] Frontend split (css/js separation)

## Instructions for Claude Code — read this at session start
This is the SPA Special Price Approval system for Coloplast India. Always read this file first before any task.
