# Special Price Approval System — Coloplast India

A production web application for managing multi-level special price discount approvals across the India sales hierarchy. Replaces fragmented Excel/email/WhatsApp workflows with a structured, role-driven system.

**Live:** https://spa-app-orpin.vercel.app

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file HTML/CSS/Vanilla JS (`index.html`) |
| Backend | Node.js + Express (Vercel serverless functions) |
| Database | Supabase (PostgreSQL) |
| Auth | JWT (8h expiry, role + zone encoded in token) |
| Hosting | Vercel (auto-deploy from `main` branch) |
| Cron | Vercel Cron — daily lapse check at 01:00 UTC |

---

## Architecture

```
Browser (index.html)
    │
    ├── GET/POST /api/requests      — submit, list, approve, reject
    ├── PATCH    /api/requests/:id  — status advance
    ├── PATCH    /api/requests/:id/confirm — TM deal confirmation
    ├── GET      /api/dealers       — dealer autocomplete (306 dealers)
    ├── POST     /api/login         — returns JWT
    └── POST     /api/admin/*       — import-users, run-lapse-check (admin only)

Backend (src/)
    ├── routes/auth.js       — login, /health, /users
    ├── routes/requests.js   — CRUD + confirm endpoint
    ├── routes/dealers.js    — dealer lookup
    ├── routes/admin.js      — import-users, lapse-check cron
    ├── middleware/auth.js   — JWT verifyToken
    └── db/
        ├── supabaseClient.js
        └── mappers.js       — dbToJs / jsToDb (snake_case ↔ camelCase)

Database (Supabase / PostgreSQL)
    ├── users            — 74 rows (TM, RSM, ZSM, NSM, CM, SC)
    ├── dealers          — 306 rows
    ├── price_requests   — requests with full audit columns
    ├── escalation_rules — 4 rows (approval thresholds by SDR%)
    └── approval_history — (unused, reserved for audit trail)
```

---

## How Auth Works

1. `POST /api/login` validates email + bcrypt password against the `users` table.
2. On success, signs a JWT containing `{ id, role, name, zone, region }` with 8h expiry.
3. All protected routes use `verifyToken` middleware — extracts user from `Authorization: Bearer <token>`.
4. Zone-based visibility: TMs see only their own requests; RSMs see their zone's TMs; ZSMs see zone TMs + RSMs; NSM/CM see all.

---

## Role Hierarchy

```
NSM (National Sales Manager)
├── ZSM South  →  RSM AP-TL, RSM Karnataka, RSM Tamil Nadu, RSM Kerala
├── ZSM East   →  RSM East (also acts as ZSM East)
├── ZSM North  →  RSM DL-NCR, RSM UP-BHR-JH, RSM UNR
└── [West ZSM vacant] → RSM GJ-RAJ, RSM Mumbai-MP, RSM ROM report to NSM directly
    CM (Country Manager) — approves high-discount requests
    SC (Supply Chain)    — views approved contracts above 35% SDR
```

**Approval chain:** RSM → ZSM → NSM → CM, determined by SDR%.
**Deal confirmation:** TM must confirm within 14 days of approval or request auto-lapses.
**Validity clock:** Starts on TM confirmation, runs for `validity_days` (1–365, set at submission).

---

## Environment Variables

Required in `.env` (local) and Vercel project settings (production):

```
# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# JWT
JWT_SECRET=<long-random-string>
JWT_EXPIRES_IN=8h

# Admin endpoints
ADMIN_SECRET=<long-random-string>

# Migrations (local only — not needed in production)
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# Runtime
PORT=3000
NODE_ENV=development
```

> The `/api/admin/migrate` endpoint is blocked in production (`NODE_ENV=production`). Run schema migrations via the Supabase SQL Editor.

---

## Running Locally

```bash
git clone https://github.com/Niteesh-Gupta/Spa-app.git
cd Spa-app
npm install
cp .env.example .env          # fill in your Supabase + JWT values
npm run dev                   # nodemon server.js — hot reload on :3000
```

The frontend (`index.html`) is served by Vercel in production. Locally, open it directly in a browser and point `API_BASE` (top of the script block) to `http://localhost:3000`.

---

## Deployment

Push to `main` → Vercel auto-deploys. No build step required.

```bash
git push origin main
```

Vercel Cron (`vercel.json`) runs `POST /api/admin/run-lapse-check` daily at 01:00 UTC.  
The endpoint can also be triggered manually:

```bash
curl -X POST https://spa-app-orpin.vercel.app/api/admin/run-lapse-check \
     -H "Authorization: Bearer <ADMIN_SECRET>"
```

---

## User Management

Users are imported via CSV using the admin import endpoint:

```bash
# 1. Prepare CSV (scripts/users.csv):
#    columns: name, email, role, zone, manager_email
#    zones: North | South | East | West

node scripts/convert-users-csv.js        # → scripts/users-import.json

curl -X POST https://spa-app-orpin.vercel.app/api/admin/import-users \
     -H "Authorization: Bearer <ADMIN_SECRET>" \
     -H "Content-Type: application/json" \
     -d @scripts/users-import.json
```

Default password for all imported users: `Password@123`

---

## Known Limitations

- **Migration-002 columns** (`dealer_name`, `skus`, `dealer_margin`, etc.) not yet applied to the live DB. Submissions fall back to base-column insert; dealer and SKU detail is not persisted until migration runs.
- **Frontend is a single file** — `index.html` contains all HTML, CSS, and JS (~1800 lines). CSS/JS separation is on the roadmap.
- **Hardcoded HIER lookup** in `index.html` — a prototype-era map of demo TM names to zones. Real users resolve via `_zone` from JWT; the map is unused for production accounts.
- **No email notifications** — approval actions are in-app only.
- **No audit trail** — `approval_history` table exists but is not written to.

---

## Roadmap

- [ ] Run migration-002 on live DB (dealer, SKU, deal_stage columns)
- [ ] Zone-aware routing enforcement (TM/RSM/ZSM see only their zone)
- [ ] Expiry alert + re-raise flow for lapsed deals
- [ ] Audit trail (write to `approval_history` on every status change)
- [ ] Admin user management panel (UI)
- [ ] Email notifications (approval actions, lapse warnings)
- [ ] Frontend split (CSS/JS into separate files)
- [ ] Hospital/account lookup (replace free-text with DB lookup)

---

*Coloplast India · Built by Niteesh Gupta · AI-assisted development*
