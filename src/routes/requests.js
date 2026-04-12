'use strict';

const express    = require('express');
const supabase   = require('../db/supabaseClient');
const { dbToJs, jsToDb } = require('../db/mappers');
const { verifyToken }    = require('../middleware/auth');

const router = express.Router();

// ── Visibility helper ─────────────────────────────────────────────────────────
//
// Hierarchy (zone-based):
//
//   TM           : own requests only
//   RSM          : all TM requests in the same zone
//   ZSM          : all TM + RSM requests in the same zone
//   NSM / CM     : all requests, all zones
//   SC           : ACTIVE_CONTRACT requests with discount_percent > 35
//
// Notes:
//   - West ZSM is vacant; West RSMs report to NSM directly. RSM zone filter
//     still works correctly — they see West TM requests as normal.
//   - East ZSM (insdc@coloplast.com) has dual RSM/ZSM role; stored as ZSM
//     in DB so ZSM filter applies.
//   - zone comes from the JWT (set at login from users table).
// ─────────────────────────────────────────────────────────────────────────────
async function buildVisibilityFilter(user) {
  const { role, id: userId, zone } = user;

  // NSM / CM — see all requests across all zones
  if (['NSM', 'CM', 'FINANCE', 'ADMIN'].includes(role)) {
    return { filter: null, supplyChainOnly: false };
  }

  // SC — approved contracts above discount threshold only
  if (role === 'SC' || role === 'SUPPLY_CHAIN') {
    return { filter: null, supplyChainOnly: true };
  }

  // TM — own requests only
  if (role === 'TM' || role === 'TENDER_MANAGER') {
    return { filter: { column: 'created_by', op: 'eq', value: userId }, supplyChainOnly: false };
  }

  // RSM — all TM requests in their zone
  if (role === 'RSM') {
    const { data: tms } = await supabase
      .from('users')
      .select('id')
      .eq('zone', zone)
      .eq('role', 'TM');
    const ids = (tms || []).map(u => u.id);
    return { filter: { column: 'created_by', op: 'in', value: ids }, supplyChainOnly: false };
  }

  // ZSM — all TM and RSM requests in their zone
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

// GET /api/requests
router.get('/', verifyToken, async (req, res) => {
  try {
    const { filter, supplyChainOnly } = await buildVisibilityFilter(req.user);

    let query = supabase
      .from('price_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplyChainOnly) {
      query = query.eq('status', 'ACTIVE_CONTRACT').gt('discount_percent', 35);
    } else if (filter) {
      if (filter.op === 'eq') {
        query = query.eq(filter.column, filter.value);
      } else if (filter.op === 'in') {
        if (filter.value.length === 0) return res.json([]);
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

    res.json(rows.map(r => dbToJs({ ...r, tm_name: r.tm_name || nameMap[r.created_by] || null })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests
router.post('/', verifyToken, async (req, res) => {
  const vd = req.body.validityDays;
  if (vd === undefined || vd === null) return res.status(400).json({ error: 'validityDays is required' });
  const vdInt = parseInt(vd, 10);
  if (!Number.isInteger(vdInt) || vdInt < 1 || vdInt > 365) {
    return res.status(400).json({ error: 'validityDays must be an integer between 1 and 365' });
  }
  req.body.validityDays = vdInt;

  const row = jsToDb(req.body, req.user.id);
  let { data, error } = await supabase.from('price_requests').insert([row]).select().single();

  // Migration 002 not yet applied — retry with only the base columns that exist.
  if (error && error.message && (
    error.message.includes('does not exist') ||
    error.message.includes('schema cache') ||
    error.message.includes('Could not find')
  )) {
    console.warn('price_requests missing migration-002 columns; inserting base fields only.');
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
    ({ data, error } = await supabase.from('price_requests').insert([baseRow]).select().single());
  }

  if (error) return res.status(500).json({ error: error.message });
  const savedRow = { ...data, tm_name: data.tm_name || req.body.tm || null };
  res.status(201).json(dbToJs(savedRow));
});

// PATCH /api/requests/:id  — :id is the SPA-xxx request_number
router.patch('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const updates = {};
  if (req.body.status !== undefined) {
    updates.status = req.body.status;
    if (req.body.status === 'Approved') {
      const now = new Date();
      updates.approved_at    = now.toISOString();
      updates.lapse_deadline = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    }
  }
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

// PATCH /api/requests/:id/confirm — TM confirms their own approved deal
router.patch('/:id/confirm', verifyToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== 'TM') {
    return res.status(403).json({ error: 'Only a TM can confirm a deal' });
  }

  const { data: request, error: fetchErr } = await supabase
    .from('price_requests')
    .select('id, request_number, status, created_by, confirmed_at, validity_days')
    .eq('request_number', id)
    .single();

  if (fetchErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.created_by !== req.user.id) return res.status(403).json({ error: 'You can only confirm your own requests' });
  if (request.status !== 'Approved') return res.status(400).json({ error: `Request is not approved (current status: ${request.status})` });
  if (request.confirmed_at) return res.status(400).json({ error: 'Request has already been confirmed' });

  const confirmedAt       = new Date();
  const validityDays      = request.validity_days || 0;
  const validityExpiresAt = new Date(confirmedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const { data, error: updateErr } = await supabase
    .from('price_requests')
    .update({
      confirmed_at:        confirmedAt.toISOString(),
      deal_stage:          'Confirmed',
      validity_expires_at: validityExpiresAt.toISOString(),
      updated_at:          confirmedAt.toISOString(),
    })
    .eq('request_number', id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.json(dbToJs(data));
});

module.exports = router;
