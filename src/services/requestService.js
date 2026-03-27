'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Request Service — STUB (in-memory store)
//
// In production this is backed by the DB (SPARequests table).
// The interface here is final — replace the Map implementation with real
// DB queries when the database layer is ready.
//
// Records are never deleted — append only. update() merges fields.
// ─────────────────────────────────────────────────────────────────────────────

const _store = new Map();

/**
 * @param {object} spaData  Full SPA object to persist
 * @returns {object}        The created SPA
 */
async function create(spaData) {
  if (_store.has(spaData.id)) {
    throw new Error(`SPA with id "${spaData.id}" already exists.`);
  }
  const record = { ...spaData };
  _store.set(record.id, record);
  return { ...record };
}

/**
 * @param {string} spaId
 * @returns {object|null}
 */
async function findById(spaId) {
  const record = _store.get(spaId);
  return record ? { ...record } : null;
}

/**
 * Merge `changes` into the existing SPA. Returns the updated record.
 * @param {string} spaId
 * @param {object} changes
 * @returns {object}
 */
async function update(spaId, changes) {
  const record = _store.get(spaId);
  if (!record) throw new Error(`SPA "${spaId}" not found.`);
  const updated = { ...record, ...changes };
  _store.set(spaId, updated);
  return { ...updated };
}

/**
 * Find SPAs for the same account + product combination that are still
 * active (not ACTIVE_CONTRACT, EXPIRED, CLOSED, or SUPERSEDED).
 * Used to enforce the stale-approval rule on submit and re-raise.
 *
 * @param {string} accountName
 * @param {string} productId     Product identifier to match
 * @param {string|null} excludeId  Exclude this SPA id from results (the one just created)
 * @returns {object[]}
 */
async function findActiveByAccountAndProduct(accountName, productId, excludeId) {
  const TERMINAL_OR_FROZEN = new Set([
    'ACTIVE_CONTRACT', 'EXPIRING_SOON', 'EXPIRED', 'CLOSED', 'SUPERSEDED',
  ]);
  const results = [];
  for (const spa of _store.values()) {
    if (spa.id === excludeId) continue;
    if (spa.accountName !== accountName) continue;
    const spaProd = _getProductId(spa.productDetails);
    if (spaProd !== productId) continue;
    if (TERMINAL_OR_FROZEN.has(spa.status)) continue;
    results.push({ ...spa });
  }
  return results;
}

/**
 * Returns all SPAs — for testing / reporting only.
 * @returns {object[]}
 */
async function findAll() {
  return Array.from(_store.values()).map(s => ({ ...s }));
}

// Extract a comparable product id string from productDetails.
// productDetails can be a string (id/sku) or an object with an id field.
function _getProductId(productDetails) {
  if (!productDetails) return '';
  if (typeof productDetails === 'string') return productDetails;
  return productDetails.id || productDetails.sku || JSON.stringify(productDetails);
}

module.exports = {
  create,
  findById,
  update,
  findActiveByAccountAndProduct,
  findAll,
};
