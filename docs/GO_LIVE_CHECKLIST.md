# SPA System — Go-Live Checklist

Live URL: https://spa-app-orpin.vercel.app

Complete these steps in order before announcing go-live to users.

---

## Step 1 — Clean Test Data

Run `supabase/migrations/006_clean_test_data.sql` against the production database.

**How:**
1. Open Supabase dashboard → Project → SQL Editor → New query
2. Paste the contents of `006_clean_test_data.sql`
3. Run the **Preview A** and **Preview B** SELECT queries first — confirm the rows shown are test-only
4. Run the DELETE statements
5. Confirm: `SELECT COUNT(*) AS remaining_requests FROM price_requests;` returns `0`

**Also required before go-live:**
Run migration-002 columns (dealer_name, skus, dealer_margin, realisation, expected_revenue, deal_stage, linked_to, extra_info, npd, date, tm_name) — paste the ALTER TABLE block from `src/routes/admin.js` `/migrate` endpoint into the SQL Editor and execute. Without this, dealer and SKU data is not persisted on submission.

---

## Step 2 — Communicate Credentials to All Users

Send login details to all 73 users (58 TM, 11 RSM, 3 ZSM, 1 NSM + CM and SC accounts).

**Message template:**

> Subject: Special Price Approval System — Your Login Details
>
> Dear [Name],
>
> The Coloplast India Special Price Approval System is now live.
>
> Login URL: https://spa-app-orpin.vercel.app
> Your email: [their coloplast email]
> Temporary password: **Password@123**
>
> Please log in and change your password after first sign-in.
>
> Role-specific guidance:
> - **TM:** Use "New Request" to submit special price requests. Set validity days carefully — the clock starts when you confirm the deal.
> - **RSM/ZSM/NSM/CM:** Your dashboard shows requests pending your action. Approve or reject from the request detail view.
>
> For issues, contact [admin contact].

**User list export:** `GET /api/users` returns all 75 users with email and role. Use this to generate the distribution list.

---

## Step 3 — Go-Live Announcement

Send a broader announcement to the India sales leadership team.

**Checklist before sending:**
- [ ] Migration-002 SQL executed (dealer/SKU columns exist)
- [ ] 006_clean_test_data.sql executed (0 rows in price_requests)
- [ ] Spot-check: log in as one TM, submit a test request, approve as RSM, confirm as TM — delete after
- [ ] Verify lapse cron is active: check Vercel dashboard → Functions → Cron Jobs → `/api/admin/run-lapse-check` scheduled at `0 1 * * *`
- [ ] Confirm all 4 zones have at least one RSM who can log in

---

## Step 4 — Monitor First 5 Real Requests

Once real users begin submitting, track the first 5 requests end-to-end.

| # | What to check | How |
|---|---|---|
| 1 | Request submitted with correct status `Pending RSM` | `GET /api/requests` as admin |
| 2 | RSM receives and approves within expected SLA | Check request status after RSM action |
| 3 | ZSM/NSM routing correct for high-SDR requests | Verify `status` advances through correct chain |
| 4 | TM confirms deal — `deal_stage = Confirmed`, `validity_expires_at` set correctly | Read request via API |
| 5 | Lapse cron fires correctly at 01:00 UTC if any deal is unconfirmed past 14 days | Check Vercel function logs |

**Manual lapse-check trigger (if needed):**
```bash
curl -X POST https://spa-app-orpin.vercel.app/api/admin/run-lapse-check \
     -H "Authorization: Bearer <ADMIN_SECRET>"
```

---

## Known Limitations at Go-Live

| Issue | Impact | Workaround |
|---|---|---|
| Migration-002 not run | Dealer name, SKU detail, deal stage not saved | Run SQL before go-live |
| No email notifications | Approvers must log in to see pending items | Manual communication until email automation added |
| No audit trail written | `approval_history` table empty | Status history visible in request chain view |
| Hospital field is free-text | No validation against account list | Users enter manually; lookup planned for next phase |
| Single-file frontend | Slower loads on first visit | Acceptable at current scale (<100 users) |
