'use strict';

const express    = require('express');
const bcrypt     = require('bcryptjs');
const { Client: PgClient } = require('pg');
const supabase   = require('../db/supabaseClient');

const router = express.Router();

// ── Shared admin auth helper ──────────────────────────────────────────────────
function checkAdminSecret(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    return false;
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== adminSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/admin/run-lapse-check
// Marks approved deals as lapsed when the 14-day confirmation window has expired.
// Called daily by Vercel Cron (vercel.json) — Vercel sets x-vercel-cron: 1, no Bearer needed.
// Can also be called manually with ADMIN_SECRET Bearer token.
router.post('/run-lapse-check', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (!isVercelCron && !checkAdminSecret(req, res)) return;

  const now = new Date().toISOString();

  const { data: toUpdate, error: fetchErr } = await supabase
    .from('price_requests')
    .select('id, request_number')
    .eq('status', 'Approved')
    .is('confirmed_at', null)
    .lt('lapse_deadline', now);

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!toUpdate || toUpdate.length === 0) return res.json({ lapsed: 0 });

  const ids = toUpdate.map(r => r.id);

  const { error: updateErr } = await supabase
    .from('price_requests')
    .update({ deal_stage: 'lapsed', status: 'lapsed', updated_at: now })
    .in('id', ids);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  console.log(`[lapse-check] Lapsed ${ids.length} request(s): ${toUpdate.map(r => r.request_number).join(', ')}`);
  res.json({ lapsed: ids.length, requests: toUpdate.map(r => r.request_number) });
});

// POST /api/admin/import-users
// Upserts users on email — inserts new (with default password), updates existing (no password change).
// Body: [{ name, email, role, zone, manager_email? }, ...]
router.post('/import-users', async (req, res) => {
  if (!checkAdminSecret(req, res)) return;

  const users = req.body;
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Body must be a non-empty array of users' });
  }

  const VALID_ROLES    = ['TM', 'RSM', 'ZSM', 'NSM', 'CM', 'SC'];
  const VALID_ZONES    = ['North', 'South', 'East', 'West'];
  const ZONE_ALL_ROLES = ['NSM', 'CM'];

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!u.name  || typeof u.name  !== 'string') return res.status(400).json({ error: `users[${i}]: name is required` });
    if (!u.email || typeof u.email !== 'string') return res.status(400).json({ error: `users[${i}]: email is required` });
    if (!VALID_ROLES.includes(u.role)) return res.status(400).json({ error: `users[${i}]: role must be one of ${VALID_ROLES.join(', ')}` });
    const zoneOk = VALID_ZONES.includes(u.zone) || (ZONE_ALL_ROLES.includes(u.role) && u.zone === 'All');
    if (!zoneOk) return res.status(400).json({ error: `users[${i}]: zone must be one of ${VALID_ZONES.join(', ')}${ZONE_ALL_ROLES.includes(u.role) ? ' or All' : ''}` });
  }

  try {
    // Resolve manager_email → manager_id
    const managerEmails = [...new Set(users.map(u => u.manager_email).filter(Boolean))];
    let managerMap = {};
    if (managerEmails.length > 0) {
      const { data: managers, error: mErr } = await supabase.from('users').select('id, email').in('email', managerEmails);
      if (mErr) return res.status(500).json({ error: mErr.message });
      managerMap = Object.fromEntries((managers || []).map(m => [m.email, m.id]));
    }

    // Split into new vs existing by email
    const incomingEmails = users.map(u => u.email);
    const { data: existingRows, error: exErr } = await supabase.from('users').select('id, email').in('email', incomingEmails);
    if (exErr) return res.status(500).json({ error: exErr.message });
    const existingEmailSet = new Set((existingRows || []).map(r => r.email.toLowerCase()));

    const toInsert = [];
    const toUpdate = [];
    let defaultHash = null;

    for (const u of users) {
      const payload = {
        name:       u.name.trim(),
        email:      u.email.trim().toLowerCase(),
        role:       u.role,
        zone:       u.zone,
        manager_id: u.manager_email ? (managerMap[u.manager_email] || null) : null,
      };
      if (existingEmailSet.has(u.email.trim().toLowerCase())) {
        toUpdate.push(payload);
      } else {
        if (!defaultHash) defaultHash = await bcrypt.hash('Coloplast@1', 10);
        toInsert.push({ ...payload, password_hash: defaultHash });
      }
    }

    // Inserts
    let insertedCount = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('users').insert(toInsert);
      if (insErr) return res.status(500).json({ error: `Insert failed: ${insErr.message}` });
      insertedCount = toInsert.length;
    }

    // Updates — use .update().eq() to never touch password_hash
    // (upsert's INSERT half fails NOT NULL on password_hash before conflict fires)
    let updatedCount = 0;
    if (toUpdate.length > 0) {
      const results = await Promise.all(
        toUpdate.map(p =>
          supabase.from('users')
            .update({ name: p.name, role: p.role, zone: p.zone, manager_id: p.manager_id })
            .eq('email', p.email)
        )
      );
      const failed = results.find(r => r.error);
      if (failed) return res.status(500).json({ error: `Update failed: ${failed.error.message}` });
      updatedCount = toUpdate.length;
    }

    res.json({ inserted: insertedCount, updated: updatedCount, total: insertedCount + updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/migrate
// One-time endpoint to add migration-002 columns to price_requests.
// Protected by MIGRATION_SECRET header (x-migration-secret).
router.post('/migrate', async (req, res) => {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || req.headers['x-migration-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const client = new PgClient({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE price_requests
        ADD COLUMN IF NOT EXISTS date              TEXT,
        ADD COLUMN IF NOT EXISTS tm_name           TEXT,
        ADD COLUMN IF NOT EXISTS dealer_name       TEXT,
        ADD COLUMN IF NOT EXISTS skus              JSONB,
        ADD COLUMN IF NOT EXISTS dealer_margin     NUMERIC,
        ADD COLUMN IF NOT EXISTS realisation       NUMERIC,
        ADD COLUMN IF NOT EXISTS expected_revenue  NUMERIC,
        ADD COLUMN IF NOT EXISTS deal_stage        TEXT,
        ADD COLUMN IF NOT EXISTS linked_to         TEXT,
        ADD COLUMN IF NOT EXISTS extra_info        JSONB,
        ADD COLUMN IF NOT EXISTS npd               INTEGER
    `);
    res.json({ ok: true, message: 'Migration complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.end().catch(() => {});
  }
});

module.exports = router;
