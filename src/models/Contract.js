'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Contract model — table: contracts
//
// A contract is the frozen master record created when a SPA is confirmed.
// One SPA → one contract (1:1, enforced by UNIQUE on spa_id).
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'contracts';

/**
 * Create the contract master record when a SPA is confirmed.
 * @param {{
 *   spaId:                string,
 *   accountName:          string,
 *   productDetails:       object,
 *   approvedPrice:        number,
 *   standardPrice:        number,
 *   discountPct:          number,
 *   startDate:            Date|string,
 *   endDate:              Date|string,
 *   approvalChainSummary: object[],
 *   confirmedAt:          Date|string,
 * }} contractData
 * @returns {object}
 */
async function create(contractData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(contractData))
    .select()
    .single();

  if (error) throw new Error(`Contract.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * @param {string} id  UUID
 * @returns {object|null}
 */
async function findById(id) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Contract.findById failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Look up the contract for a given SPA reference.
 * @param {string} spaId  e.g. SDR-2026-03-00001
 * @returns {object|null}
 */
async function findBySpaId(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .maybeSingle();

  if (error) throw new Error(`Contract.findBySpaId failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns all active contracts (end_date >= today).
 * @returns {object[]}
 */
async function findActive() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  if (error) throw new Error(`Contract.findActive failed: ${error.message}`);
  return toCamelList(data);
}

/**
 * Supply Chain lookup — verify a SPA reference is a live contract.
 * Returns the contract if found and active, null otherwise.
 *
 * @param {string} spaId
 * @returns {object|null}
 */
async function verifyForCreditNote(spaId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .gte('end_date', today)
    .maybeSingle();

  if (error) throw new Error(`Contract.verifyForCreditNote failed: ${error.message}`);
  return toCamel(data);
}

module.exports = { create, findById, findBySpaId, findActive, verifyForCreditNote };
