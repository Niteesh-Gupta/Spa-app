# SPA System — End-to-End Test Checklist

Live URL: https://spa-app-orpin.vercel.app

---

## Scenario 1 — TM Login and Form Submission

**Goal:** TM can log in, fill the form with validity days, and submit a request that routes correctly.

**Preconditions:** Have a TM-role user's email and password (default: `Coloplast@1`).

| # | Step | Expected |
|---|------|----------|
| 1 | Open the live URL | Login screen shown |
| 2 | Enter TM email + password, click Sign In | Dashboard loads; role banner shows `TM View — <Name>` |
| 3 | Click `+ New Request` | Form opens; date pre-filled; Zone field auto-populated from user's zone |
| 4 | Type at least 3 characters in **Dealer Name** | Autocomplete dropdown appears with matching dealer names |
| 5 | Select a dealer from the dropdown | Dealer field fills; dropdown closes |
| 6 | Fill **Hospital / Account Name** | Free-text accepted |
| 7 | Add at least one SKU row — enter SKU code, select from catalog, enter SP | MRP and DP populate; SDR% calculates; tier indicator updates |
| 8 | Enter **Validity Days** (e.g. `90`) | Field accepts 1–365 |
| 9 | Enter **Justification** | Text accepted |
| 10 | Click **Submit Request** | Success toast; request appears in TM dashboard with status `Pending RSM` |
| 11 | Verify request ID is `SPA-xxx` format | Correct |
| 12 | Log out and log back in | Session restored; same request visible |

---

## Scenario 2 — RSM Approval Flow

**Goal:** RSM sees TM's pending request, approves or rejects it.

**Preconditions:** Scenario 1 complete; have RSM-role user for the same zone.

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as RSM | Dashboard shows `RSM View`; badge shows count of items pending action |
| 2 | Dashboard card shows the TM's request with status `Pending RSM` | Correct |
| 3 | Click the request row to open detail modal | Full details shown; **Approve** and **Reject** buttons visible |
| 4 | Click **✓ Approve** | Request status changes to next tier (`Pending ZSM` or `Approved` if no ZSM in chain) |
| 5 | Toast confirms action | "Approved" toast shown |
| 6 | Switch to TM login — check request status | Status updated correctly |
| 7 | **Rejection test:** Repeat steps 1–3 on a second request, click **✕ Reject** | Status → `Rejected`; TM sees "↑ Re-raise" button |

---

## Scenario 3 — ZSM Approval Flow

**Goal:** ZSM sees RSM-approved request and can approve up to NSM or directly to Approved.

**Preconditions:** Scenario 2 complete with request at `Pending ZSM`; have ZSM-role user for the zone.

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as ZSM | Badge shows pending items |
| 2 | Request at `Pending ZSM` is visible | Correct; requests from other zones NOT visible |
| 3 | Open the request — click **✓ Approve** | Status advances to `Pending NSM` (or `Approved` if chain is shorter) |
| 4 | Verify TM and RSM views show updated status | Correct — all roles see the same current status |
| 5 | **West zone note:** West ZSM is vacant — West RSMs' requests skip ZSM and go directly to NSM (`Pending NSM`) | Verify no ZSM approval required for West zone requests |

---

## Scenario 4 — TM Confirm Deal After Approval

**Goal:** After full approval, TM can confirm the deal within 14 days; confirmation starts validity clock.

**Preconditions:** A request has reached `Approved` status (all tiers passed).

| # | Step | Expected |
|---|------|----------|
| 1 | Log in as TM | Approved request visible; status badge = `Approved` |
| 2 | Request row shows **✓ Confirm Deal** button | Button present |
| 3 | Click **✓ Confirm Deal** | Confirmation dialog or direct action |
| 4 | After confirmation: `deal_stage` → `Confirmed`; `confirmed_at` timestamp set | Verify by re-opening request detail |
| 5 | **✓ Confirm Deal** button disappears | Correct — can only confirm once |
| 6 | Validity countdown has started (validity_days from confirmed_at) | Confirm in DB: `validity_expires_at = confirmed_at + validity_days days` |
| 7 | **Already confirmed:** Try calling confirm again via API | Should return `400 Request has already been confirmed` |

---

## Scenario 5 — Auto-Lapse After 14 Days (Manual Trigger Test)

**Goal:** Verify the lapse cron logic works — approved-but-unconfirmed requests lapse after 14 days.

**Note:** In production the cron runs daily at 01:00 UTC. Use the manual trigger endpoint for testing.

**Preconditions:** An approved (status = `Approved`) request with `confirmed_at = null` and `lapse_deadline` in the past (set via DB or wait).

**Option A — Manipulate via Supabase SQL Editor (fastest):**
```sql
UPDATE price_requests
SET lapse_deadline = NOW() - INTERVAL '1 minute'
WHERE status = 'Approved' AND confirmed_at IS NULL
RETURNING request_number, lapse_deadline;
```

**Option B — Set validity short on a test request and wait.**

| # | Step | Expected |
|---|------|----------|
| 1 | Ensure at least one request has `status = 'Approved'`, `confirmed_at = NULL`, `lapse_deadline` < now | Verified in DB |
| 2 | Call lapse-check endpoint manually: `POST https://spa-app-orpin.vercel.app/api/admin/run-lapse-check` with header `Authorization: Bearer <ADMIN_SECRET>` | Response: `{ "lapsed": N, "requests": ["SPA-xxx"] }` |
| 3 | Log in as TM — check the affected request | Status = `Lapsed`; deal_stage = `Lapsed`; **✓ Confirm Deal** button gone |
| 4 | Log in as RSM/ZSM — verify lapsed request is visible but not actionable | Correct |
| 5 | Verify lapsed request does NOT appear in the cron query on next run (already lapsed, status no longer `Approved`) | Run cron again — `{ "lapsed": 0 }` |
| 6 | **Cron schedule sanity:** Check `vercel.json` — cron path is `/api/admin/run-lapse-check` at `0 1 * * *` | Confirmed |
