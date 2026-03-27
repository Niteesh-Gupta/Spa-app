'use strict';

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
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
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, region: user.region } });
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

// ── Requests ──────────────────────────────────────────────────────────────────
app.get('/api/requests', verifyToken, async (_req, res) => {
  const { data, error } = await supabase
    .from('price_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(dbToJs));
});

app.post('/api/requests', verifyToken, async (req, res) => {
  const row = jsToDb(req.body, req.user.id);
  const { data, error } = await supabase
    .from('price_requests')
    .insert([row])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(dbToJs(data));
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
