'use strict';

// ── Generic camelCase ↔ snake_case ────────────────────────────────────────────

function toCamel(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      v,
    ])
  );
}

function toSnake(obj) {
  if (!obj) return null;
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v,
      ])
  );
}

function toCamelList(rows) {
  return (rows || []).map(toCamel);
}

// ── price_requests domain mappers ─────────────────────────────────────────────
//
// DB columns (snake_case) → JS object (camelCase used throughout the frontend)
//
// Base columns:    id, request_number, created_by, customer_name, product,
//                  standard_price, requested_price, discount_percent, quantity,
//                  reason, status, current_approver_role, created_at, updated_at
//
// Migration 002:   date, tm_name, dealer_name, skus, dealer_margin,
//                  realisation, expected_revenue, deal_stage,
//                  linked_to, extra_info, npd
//
// Migration 004+:  validity_days, confirmed_at, lapse_deadline, zone, manager_id
//
// Migration 005:   validity_expires_at, approved_at

function dbToJs(row) {
  if (!row) return null;
  return {
    id:                 row.request_number,   // SPA-xxx — human-readable ID used by frontend
    _dbId:              row.id,               // UUID — used for DB updates
    date:               row.date || (row.created_at ? row.created_at.slice(0, 10) : null),
    tm:                 row.tm_name,
    customer:           row.customer_name,
    dealer:             row.dealer_name,
    dealerId:           row.dealer_id,
    product:            row.product,
    skus:               row.skus,
    stdPrice:           row.standard_price,
    reqPrice:           row.requested_price,
    dealerMargin:       row.dealer_margin,
    realisation:        row.realisation,
    expectedRevenue:    row.expected_revenue,
    sdrPct:             row.discount_percent,
    volume:             row.quantity,
    justification:      row.reason,
    dealStage:          row.deal_stage,
    validityDays:       row.validity_days,
    approvedAt:         row.approved_at,
    confirmedAt:        row.confirmed_at,
    lapseDeadline:      row.lapse_deadline,
    validityExpiresAt:  row.validity_expires_at,
    status:             row.status,
    tier:               row.current_approver_role,
    linkedTo:           row.linked_to,
    reRaisedFrom:       row.re_raised_from,
    extraInfo:          row.extra_info,
    npd:                row.npd,
  };
}

function jsToDb(obj, userId) {
  return {
    request_number:        obj.id,
    created_by:            userId || null,
    date:                  obj.date,
    tm_name:               obj.tm,
    customer_name:         obj.customer,
    dealer_name:           obj.dealer          || null,
    dealer_id:             obj.dealerId        || null,
    product:               obj.product,
    skus:                  obj.skus            || null,
    standard_price:        obj.stdPrice        || null,
    requested_price:       obj.reqPrice        || null,
    discount_percent:      obj.sdrPct          || null,
    dealer_margin:         obj.dealerMargin    || null,
    realisation:           obj.realisation     || null,
    expected_revenue:      obj.expectedRevenue || null,
    quantity:              obj.volume          || null,
    reason:                obj.justification,
    deal_stage:            obj.dealStage       || null,
    validity_days:         obj.validityDays    || null,
    status:                obj.status,
    current_approver_role: obj.tier,
    linked_to:             obj.linkedTo        || null,
    extra_info:            obj.extraInfo       || null,
    npd:                   obj.npd             || null,
  };
}

module.exports = { toCamel, toSnake, toCamelList, dbToJs, jsToDb };
