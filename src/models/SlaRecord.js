'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SlaRecord model — table: sla_records
//
// Tracks the SLA clock for each approval level on each SPA.
// A new record is opened when the SPA enters a PENDING_* status.
// It is closed (completed_at set) when the approver takes action.
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'sla_records';

/**
 * Open a new SLA clock for an approval level.
 * @param {{
 *   spaId:         string,
 *   approvalLevel: string,  // RSM | ZSM | NSM | CM
 *   slaHours?:     number,  // default 48
 * }} recordData
 * @returns {object}
 */
async function open(recordData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(recordData))
    .select()
    .single();

  if (error) throw new Error(`SlaRecord.open failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Close the SLA clock — approver has taken action.
 * Automatically marks as breached if elapsed time exceeds sla_hours.
 *
 * @param {string} id          UUID
 * @param {string} actionTaken APPROVE | REJECT | CLARIFY
 * @returns {object}
 */
async function close(id, actionTaken) {
  // First fetch to check if breached
  const { data: existing, error: fetchError } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`SlaRecord.close (fetch) failed: ${fetchError.message}`);

  const now         = new Date();
  const startedAt   = new Date(existing.started_at);
  const elapsedHrs  = (now - startedAt) / (1000 * 60 * 60);
  const breached    = elapsedHrs > existing.sla_hours;

  const { data, error } = await db
    .from(TABLE)
    .update({
      completed_at: now.toISOString(),
      action_taken: actionTaken,
      breached,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`SlaRecord.close failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns all SLA records for a SPA.
 * @param {string} spaId
 * @returns {object[]}
 */
async function findBySpaId(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .order('started_at', { ascending: true });

  if (error) throw new Error(`SlaRecord.findBySpaId failed: ${error.message}`);
  return toCamelList(data);
}

/**
 * Returns all open (not yet completed) SLA records that have exceeded their limit.
 * Used by the scheduler to detect and flag SLA breaches.
 * @returns {object[]}
 */
async function findBreached() {
  // Postgres interval comparison: started_at + sla_hours hours < NOW() AND completed_at IS NULL
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .is('completed_at', null)
    .eq('breached', false);

  if (error) throw new Error(`SlaRecord.findBreached failed: ${error.message}`);

  const now = new Date();
  return toCamelList(data).filter(r => {
    const elapsedHrs = (now - new Date(r.startedAt)) / (1000 * 60 * 60);
    return elapsedHrs > r.slaHours;
  });
}

module.exports = { open, close, findBySpaId, findBreached };
