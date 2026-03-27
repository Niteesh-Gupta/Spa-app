'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SpaRequest model — table: spa_requests
//
// Interface intentionally mirrors requestService.js so the service can swap
// to this implementation with no changes to sdrWorkflow.js.
//
// Records are never deleted — append only.
// update() merges only the supplied fields.
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'spa_requests';

// Statuses that mean a SPA is no longer "live" for duplicate-checking purposes
const TERMINAL_OR_FROZEN = new Set([
  'ACTIVE_CONTRACT', 'EXPIRING_SOON', 'EXPIRED', 'CLOSED', 'SUPERSEDED',
]);

/**
 * @param {object} spaData  Full SPA object — camelCase fields
 * @returns {object}        The created SPA (camelCase)
 */
async function create(spaData) {
  const row = toSnake(spaData);
  const { data, error } = await db
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`SpaRequest.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * @param {string} spaId
 * @returns {object|null}  camelCase SPA or null if not found
 */
async function findById(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', spaId)
    .maybeSingle();

  if (error) throw new Error(`SpaRequest.findById failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Merge `changes` (camelCase) into the existing SPA. Returns the updated record.
 * @param {string} spaId
 * @param {object} changes  camelCase partial update
 * @returns {object}        Updated SPA (camelCase)
 */
async function update(spaId, changes) {
  const row = toSnake(changes);
  const { data, error } = await db
    .from(TABLE)
    .update(row)
    .eq('id', spaId)
    .select()
    .single();

  if (error) throw new Error(`SpaRequest.update failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Find SPAs for the same account that are still active (not terminal/frozen).
 * Used to enforce the stale-approval rule on submit and re-raise.
 *
 * productId matching is done in JS since product_details is flexible JSONB.
 *
 * @param {string}      accountName
 * @param {string}      productId     Comparable product identifier
 * @param {string|null} excludeId     Exclude this SPA id (the one just created)
 * @returns {object[]}  camelCase SPAs
 */
async function findActiveByAccountAndProduct(accountName, productId, excludeId) {
  let query = db
    .from(TABLE)
    .select('*')
    .eq('account_name', accountName)
    .not('status', 'in', `(${[...TERMINAL_OR_FROZEN].join(',')})`);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`SpaRequest.findActiveByAccountAndProduct failed: ${error.message}`);

  // Filter by product in JS — handles both string SKU and object formats
  return toCamelList(data).filter(spa => _extractProductId(spa.productDetails) === productId);
}

/**
 * Returns all SPAs — for reporting/admin use only.
 * @returns {object[]}
 */
async function findAll() {
  const { data, error } = await db.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) throw new Error(`SpaRequest.findAll failed: ${error.message}`);
  return toCamelList(data);
}

function _extractProductId(productDetails) {
  if (!productDetails) return '';
  if (typeof productDetails === 'string') return productDetails;
  return productDetails.id || productDetails.sku || JSON.stringify(productDetails);
}

module.exports = { create, findById, update, findActiveByAccountAndProduct, findAll };
