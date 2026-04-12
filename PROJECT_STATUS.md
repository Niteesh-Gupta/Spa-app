# SPA System — Project Status

**Last updated: 12-Apr-2026**

## Live URL
https://spa-app-orpin.vercel.app

## Stack
- Frontend: index.html (single file, Vercel)
- Backend: Node.js + Express (Vercel serverless)
- DB: Supabase (PostgreSQL)
- Auth: JWT

## DB State (as of 12-Apr-2026)
- users: 75 rows (73 production + CM + SC accounts)
- dealers: 306 rows
- price_requests: base columns live; migration-002 columns (dealer_name, skus, etc.) NOT YET RUN
- escalation_rules: 4 rows
- approval_history: 0 rows
- Schema has: validity_days, deal_stage, confirmed_at, lapse_deadline, zone, manager_id

## Phase Status

### Phase 1 — Foundation
- [x] DB schema migrations (validity, zones, manager_id FK, deal_stage)
- [x] TM/user list imported (74 users)
- [x] Dealer list imported (306 rows)

### Phase 2 — Users & Routing
- [x] Bulk CSV import flow (convert-users-csv.js + /api/admin/import-users)
- [x] All India user seeding (73 users: 58 TM, 11 RSM, 3 ZSM, 1 NSM)
- [x] Zone-aware routing logic (backend filter live; frontend hierarchy display fixed)
- [ ] Admin user management panel (UI) — deferred post go-live

### Phase 3 — Deal Lifecycle
- [x] Validity days on submission form (1–365, required field)
- [x] Deal confirmation flow (14-day window, auto-lapse cron at 01:00 UTC)
- [x] Expiry alert + re-raise (lapse cron live; TM re-raise button on Rejected requests)
- [x] Request number generation moved server-side (fixes SPA-001 collision bug)
- [x] Status values standardized to Title case (Approved, Rejected, Lapsed, Confirmed)

### Phase 4 — Go-Live (in progress)
- [x] Governance fixes (status casing, zone session restore, f-zone null ref, migrate endpoint)
- [x] Dealer autocomplete from DB (306 dealers, searchable with highlight)
- [x] Live hierarchy page (real data from /api/users, grouped by zone, role-aware chain)
- [x] Fake price list page removed from sidebar
- [x] README rewritten for production
- [x] E2E test checklist created (docs/TEST_CHECKLIST.md)
- [x] Go-live checklist created (docs/GO_LIVE_CHECKLIST.md)
- [x] 006_clean_test_data.sql created (ready to run, not yet executed)
- [x] Detail modal fixes (dealer field fallback, SKU table scroll)
- [ ] **BLOCKING:** Run migration-002 SQL in Supabase (dealer/SKU columns on price_requests)
- [ ] **BLOCKING:** Run 006_clean_test_data.sql (removes SPA-001 and test rows)
- [ ] Communicate credentials to 73 users (default password: Password@123)
- [ ] Go-live announcement + URL distribution
- [ ] Monitor first 5 real requests end-to-end

## Key Decisions Locked
- Validity: set by TM in days (max 365), clock starts on deal confirmation
- Confirmation window: 14 days post-approval, else auto-lapse
- User import: manual CSV via admin panel
- Zones: North, South, East, West (all India)
- Default password for all imported users: Password@123

## User Hierarchy Notes
- 73 production users (58 TM, 11 RSM, 3 ZSM, 1 NSM) + CM + SC accounts
- West ZSM vacant — West RSMs (injj, inpps, inpjm) report to NSM directly
- East ZSM = insdc@coloplast.com (Sudipta Das Chowdhury — also acts as RSM East; TMs report directly to him)

## Current Blocker
Migration-002 columns not yet applied to live price_requests table. Until run, dealer name, SKU detail, deal_stage, and tm_name are not persisted on submission. SQL is in the ALTER TABLE block inside `src/routes/admin.js` `/migrate` endpoint — paste into Supabase SQL Editor and execute.

## Roadmap (post go-live)
- [ ] Hospital/account free-text → DB lookup
- [ ] Audit trail (write to approval_history on every status change)
- [ ] Email notifications (approval actions, lapse warnings)
- [ ] Admin user management panel (UI)
- [ ] Frontend split (CSS/JS into separate files)

## Instructions for Claude Code — read this at session start
This is the SPA Special Price Approval system for Coloplast India. Always read this file first before any task.
