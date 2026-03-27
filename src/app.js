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

// ── Helpers: camelCase ↔ snake_case for requests table ───────────────────────
function dbToJs(row) {
  if (!row) return null;
  return {
    id:              row.id,
    date:            row.date,
    tm:              row.tm,
    customer:        row.customer,
    dealer:          row.dealer,
    product:         row.product,
    skus:            row.skus,
    stdPrice:        row.std_price,
    reqPrice:        row.req_price,
    dealerMargin:    row.dealer_margin,
    realisation:     row.realisation,
    expectedRevenue: row.expected_revenue,
    sdrPct:          row.sdr_pct,
    volume:          row.volume,
    justification:   row.justification,
    dealStage:       row.deal_stage,
    status:          row.status,
    tier:            row.tier,
    linkedTo:        row.linked_to,
    extraInfo:       row.extra_info,
    npd:             row.npd,
    compPrice:       row.comp_price,
  };
}

function jsToDb(obj) {
  return {
    id:               obj.id,
    date:             obj.date,
    tm:               obj.tm,
    customer:         obj.customer,
    dealer:           obj.dealer,
    product:          obj.product,
    skus:             obj.skus        || null,
    std_price:        obj.stdPrice    || null,
    req_price:        obj.reqPrice    || null,
    dealer_margin:    obj.dealerMargin|| null,
    realisation:      obj.realisation || null,
    expected_revenue: obj.expectedRevenue || null,
    sdr_pct:          obj.sdrPct      || null,
    volume:           obj.volume      || null,
    justification:    obj.justification,
    deal_stage:       obj.dealStage,
    status:           obj.status,
    tier:             obj.tier,
    linked_to:        obj.linkedTo    || null,
    extra_info:       obj.extraInfo   || null,
    npd:              obj.npd         || null,
    comp_price:       obj.compPrice   || null,
  };
}

// ── Requests ──────────────────────────────────────────────────────────────────
app.get('/api/requests', verifyToken, async (req, res) => {
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(dbToJs));
});

app.post('/api/requests', verifyToken, async (req, res) => {
  const row = jsToDb(req.body);
  const { data, error } = await supabase.from('requests').insert([row]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(dbToJs(data));
});

app.patch('/api/requests/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const updates = {};
  if (req.body.status !== undefined) updates.status = req.body.status;
  const { data, error } = await supabase.from('requests').update(updates).eq('id', id).select().single();
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
  // Only surface message to client when explicitly marked safe
  const message = err.expose  ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
