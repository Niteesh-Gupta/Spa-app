'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ApprovalRecord model — table: approval_records
//
// Interface matches approvalService.recordDecision().
// ─────────────────────────────────────────────────────────────────────────────

const db              = require('../db/supabaseClient');
const { toCamelList } = require('../db/mappers');

const TABLE = 'approval_records';

/**
 * @param {{
 *   spaId:    string,
 *   actor:    { id: string, name: string, role: string },
 *   action:   string,
 *   result:   object,
 *   metadata: object
 * }} record
 */
async function recordDecision(record) {
  const row = {
    spa_id:     record.spaId,
    actor_id:   record.actor.id,
    actor_role: record.actor.role,
    actor_name: record.actor.name,
    action:     record.action,
    result:     record.result     || {},
    metadata:   record.metadata   || {},
  };

  const { error } = await db.from(TABLE).insert(row);
  if (error) throw new Error(`ApprovalRecord.recordDecision failed: ${error.message}`);
}

/**
 * Returns all approval decisions for a SPA, oldest first.
 * @param {string} spaId
 * @returns {object[]}
 */
async function findBySpaId(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`ApprovalRecord.findBySpaId failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { recordDecision, findBySpaId };
