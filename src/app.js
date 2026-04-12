'use strict';

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Client: PgClient } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// ── Security + parsing middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const { error } = await supabase.from('users').select('count');
  res.json({ status: 'ok', version: '2.0.0', db: error ? 'disconnected' : 'connected', ts: new Date().toISOString() });
});

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', async (_req, res) => {
  const { data, error } = await supabase.from('users').select('id, name, role, email, region');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { data: users } = await supabase.from('users').select('*').eq('email', email).limit(1);
  if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, zone: user.zone || null, region: user.region || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, zone: user.zone, region: user.region } });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── price_requests column mapping ────────────────────────────────────────────
// DB columns (snake_case) → JS object (camelCase used throughout the frontend)
//
// Existing columns:  id, request_number, created_by, customer_name, product,
//                    standard_price, requested_price, discount_percent, quantity,
//                    reason, status, current_approver_role, created_at, updated_at
//
// Added by 002 migration: date, tm_name, dealer_name, skus, dealer_margin,
//                         realisation, expected_revenue, deal_stage,
//                         linked_to, extra_info, npd

function dbToJs(row) {
  if (!row) return null;
  return {
    // Use request_number as the human-readable SPA-xxx ID throughout the frontend
    id:              row.request_number,
    _dbId:           row.id,             // UUID — used for DB updates
    date:            row.date || (row.created_at ? row.created_at.slice(0, 10) : null),
    tm:              row.tm_name,
    customer:        row.customer_name,
    dealer:          row.dealer_name,
    product:         row.product,
    skus:            row.skus,
    stdPrice:        row.standard_price,
    reqPrice:        row.requested_price,
    dealerMargin:    row.dealer_margin,
    realisation:     row.realisation,
    expectedRevenue: row.expected_revenue,
    sdrPct:          row.discount_percent,
    volume:          row.quantity,
    justification:   row.reason,
    dealStage:       row.deal_stage,
    status:          row.status,
    tier:            row.current_approver_role,
    linkedTo:        row.linked_to,
    extraInfo:       row.extra_info,
    npd:             row.npd,
  };
}

function jsToDb(obj, userId) {
  return {
    request_number:        obj.id,
    created_by:            userId || null,
    date:                  obj.date,
    tm_name:               obj.tm,
    customer_name:         obj.customer,
    dealer_name:           obj.dealer       || null,
    product:               obj.product,
    skus:                  obj.skus         || null,
    standard_price:        obj.stdPrice     || null,
    requested_price:       obj.reqPrice     || null,
    discount_percent:      obj.sdrPct       || null,
    dealer_margin:         obj.dealerMargin || null,
    realisation:           obj.realisation  || null,
    expected_revenue:      obj.expectedRevenue || null,
    quantity:              obj.volume       || null,
    reason:                obj.justification,
    deal_stage:            obj.dealStage    || null,
    status:                obj.status,
    current_approver_role: obj.tier,
    linked_to:             obj.linkedTo     || null,
    extra_info:            obj.extraInfo    || null,
    npd:                   obj.npd          || null,
  };
}

// ── Visibility helper ─────────────────────────────────────────────────────────
//
// Hierarchy:  TM → RSM (same region) → ZSM (same zone) → NSM → CM
//
//   TM / TENDER_MANAGER : own requests only
//   RSM                 : own + all TMs sharing the same zone + region
//   ZSM                 : all TMs and RSMs in the same zone
//   NSM / CM            : all requests, all zones
//   SUPPLY_CHAIN        : ACTIVE_CONTRACT requests with discount_percent > 35
//   FINANCE / ADMIN     : all requests
//
// zone and region come from the JWT (set at login from users table).
// ─────────────────────────────────────────────────────────────────────────────
async function buildVisibilityFilter(user) {
  const { role, id: userId, zone, region } = user;

  // Roles that see everything
  if (['NSM', 'CM', 'FINANCE', 'ADMIN'].includes(role)) {
    return { filter: null, supplyChainOnly: false };
  }

  // Supply Chain: approved deals above threshold only
  if (role === 'SUPPLY_CHAIN') {
    return { filter: null, supplyChainOnly: true };
  }

  // TM / TENDER_MANAGER: own requests only
  if (role === 'TM' || role === 'TENDER_MANAGER') {
    return { filter: { column: 'created_by', op: 'eq', value: userId }, supplyChainOnly: false };
  }

  // RSM: own requests + TMs in the same region
  if (role === 'RSM') {
    const { data: peers } = await supabase
      .from('users')
      .select('id')
      .eq('zone', zone)
      .eq('region', region)
      .in('role', ['TM', 'RSM']);
    const ids = (peers || []).map(u => u.id);
    if (!ids.includes(userId)) ids.push(userId);
    return { filter: { column: 'created_by', op: 'in', value: ids }, supplyChainOnly: false };
  }

  // ZSM: all TMs and RSMs in the same zone
  if (role === 'ZSM') {
    const { data: zoneUsers } = await supabase
      .from('users')
      .select('id')
      .eq('zone', zone)
      .in('role', ['TM', 'RSM']);
    const ids = (zoneUsers || []).map(u => u.id);
    return { filter: { column: 'created_by', op: 'in', value: ids }, supplyChainOnly: false };
  }

  // Fallback — own only
  return { filter: { column: 'created_by', op: 'eq', value: userId }, supplyChainOnly: false };
}

// ── Requests ──────────────────────────────────────────────────────────────────
app.get('/api/requests', verifyToken, async (req, res) => {
  try {
    const { filter, supplyChainOnly } = await buildVisibilityFilter(req.user);

    let query = supabase
      .from('price_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplyChainOnly) {
      // Supply Chain sees only finalised contracts above 35% discount
      query = query
        .eq('status', 'ACTIVE_CONTRACT')
        .gt('discount_percent', 35);
    } else if (filter) {
      if (filter.op === 'eq') {
        query = query.eq(filter.column, filter.value);
      } else if (filter.op === 'in') {
        if (filter.value.length === 0) {
          // No matching subordinates — return empty
          return res.json([]);
        }
        query = query.in(filter.column, filter.value);
      }
    }
    // null filter → no restriction → all rows

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];

    // Enrich tm_name from users table when the column is missing or null
    // (migration 002 not yet applied, or rows inserted before migration)
    const needsEnrich = rows.some(r => !r.tm_name && r.created_by);
    let nameMap = {};
    if (needsEnrich) {
      const ids = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
      if (ids.length > 0) {
        const { data: users } = await supabase.from('users').select('id,name').in('id', ids);
        nameMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
      }
    }

    res.json(rows.map(r => dbToJs({
      ...r,
      tm_name: r.tm_name || nameMap[r.created_by] || null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requests', verifyToken, async (req, res) => {
  const row = jsToDb(req.body, req.user.id);
  let { data, error } = await supabase
    .from('price_requests')
    .insert([row])
    .select()
    .single();

  // Migration 002 not yet applied — retry with only the base columns that exist.
  // Supabase PostgREST reports this as "schema cache" or "does not exist".
  if (error && error.message && (
    error.message.includes('does not exist') ||
    error.message.includes('schema cache') ||
    error.message.includes('Could not find')
  )) {
    console.warn('price_requests missing migration-002 columns; inserting base fields only. Run migration 002 in Supabase SQL editor.');
    const baseRow = {
      request_number:        row.request_number,
      created_by:            row.created_by,
      customer_name:         row.customer_name,
      product:               row.product,
      standard_price:        row.standard_price,
      requested_price:       row.requested_price,
      discount_percent:      row.discount_percent,
      quantity:              row.quantity,
      reason:                row.reason,
      status:                row.status,
      current_approver_role: row.current_approver_role,
    };
    ({ data, error } = await supabase
      .from('price_requests')
      .insert([baseRow])
      .select()
      .single());
  }

  if (error) return res.status(500).json({ error: error.message });
  // Augment the saved row with tm_name so the response has a useful tm field
  const savedRow = { ...data, tm_name: data.tm_name || req.body.tm || null };
  res.status(201).json(dbToJs(savedRow));
});

// PATCH /api/requests/:id  — :id is the SPA-xxx request_number
app.patch('/api/requests/:id', verifyToken, async (req, res) => {
  const { id } = req.params;           // "SPA-001" etc.
  const updates = {};
  if (req.body.status !== undefined) updates.status = req.body.status;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('price_requests')
    .update(updates)
    .eq('request_number', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(dbToJs(data));
});

// ── One-time migration endpoint ───────────────────────────────────────────────
// Call once to add multi-SKU columns to price_requests, then it's a no-op.
// Protected by MIGRATION_SECRET env var.
app.post('/api/admin/migrate', async (req, res) => {
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

// ── Admin: bulk import users ──────────────────────────────────────────────────
// POST /api/admin/import-users
// Authorization: Bearer <ADMIN_SECRET>
// Body: [{ name, email, role, zone, manager_email? }, ...]
// Upserts on email — inserts new users, updates existing ones (never touches password_hash).
// Returns: { inserted, updated, total }
app.post('/api/admin/import-users', async (req, res) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Validate body ───────────────────────────────────────────────────────────
  const users = req.body;
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Body must be a non-empty array of users' });
  }

  const VALID_ROLES      = ['TM', 'RSM', 'ZSM', 'NSM', 'CM', 'SC'];
  const VALID_ZONES      = ['North', 'South', 'East', 'West'];
  const ZONE_ALL_ROLES   = ['NSM', 'CM']; // roles permitted to use zone "All"

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!u.name || typeof u.name !== 'string') return res.status(400).json({ error: `users[${i}]: name is required` });
    if (!u.email || typeof u.email !== 'string') return res.status(400).json({ error: `users[${i}]: email is required` });
    if (!VALID_ROLES.includes(u.role)) return res.status(400).json({ error: `users[${i}]: role must be one of ${VALID_ROLES.join(', ')}` });
    const zoneOk = VALID_ZONES.includes(u.zone) || (ZONE_ALL_ROLES.includes(u.role) && u.zone === 'All');
    if (!zoneOk) return res.status(400).json({ error: `users[${i}]: zone must be one of ${VALID_ZONES.join(', ')}${ZONE_ALL_ROLES.includes(u.role) ? ' or All' : ''}` });
  }

  try {
    // ── Resolve manager_email → manager_id ──────────────────────────────────
    const managerEmails = [...new Set(users.map(u => u.manager_email).filter(Boolean))];
    let managerMap = {};
    if (managerEmails.length > 0) {
      const { data: managers, error: mErr } = await supabase
        .from('users')
        .select('id, email')
        .in('email', managerEmails);
      if (mErr) return res.status(500).json({ error: mErr.message });
      managerMap = Object.fromEntries((managers || []).map(m => [m.email, m.id]));
    }

    // ── Find which emails already exist ─────────────────────────────────────
    const incomingEmails = users.map(u => u.email);
    const { data: existingRows, error: exErr } = await supabase
      .from('users')
      .select('id, email')
      .in('email', incomingEmails);
    if (exErr) return res.status(500).json({ error: exErr.message });
    const existingEmailSet = new Set((existingRows || []).map(r => r.email.toLowerCase()));

    // ── Build insert / update payloads ───────────────────────────────────────
    const toInsert = [];
    const toUpdate = [];

    // Default password hash for brand-new accounts — hashed once for the batch
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
        if (!defaultHash) {
          defaultHash = await bcrypt.hash('Coloplast@1', 10);
        }
        toInsert.push({ ...payload, password_hash: defaultHash });
      }
    }

    // ── Execute inserts ──────────────────────────────────────────────────────
    let insertedCount = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('users').insert(toInsert);
      if (insErr) return res.status(500).json({ error: `Insert failed: ${insErr.message}` });
      insertedCount = toInsert.length;
    }

    // ── Execute updates — use .update().eq() to never touch password_hash ──────
    // Cannot use upsert here: the INSERT half of INSERT...ON CONFLICT fails the
    // NOT NULL constraint on password_hash before conflict detection fires.
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

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Express requires 4-arg signature for error middleware.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status  = err.status  || 500;
  const message = err.expose  ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
