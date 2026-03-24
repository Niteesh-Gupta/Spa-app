'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ClarificationThread model — table: clarification_threads
//
// Tracks each Q&A exchange between an approver and the raiser.
// A single SPA can have multiple clarification threads across levels.
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'clarification_threads';

/**
 * Record a new clarification question from an approver.
 * @param {{
 *   spaId:       string,
 *   askedByRole: string,
 *   askedById:   string,
 *   question:    string,
 * }} threadData
 * @returns {object}
 */
async function create(threadData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(threadData))
    .select()
    .single();

  if (error) throw new Error(`ClarificationThread.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Record the raiser's answer to an open clarification.
 * @param {string} id           UUID of the thread
 * @param {string} answeredById Actor who answered
 * @param {string} answer
 * @returns {object}
 */
async function recordAnswer(id, answeredById, answer) {
  const { data, error } = await db
    .from(TABLE)
    .update({
      answered_by_id: answeredById,
      answer,
      answered_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`ClarificationThread.recordAnswer failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns all clarification threads for a SPA, oldest first.
 * @param {string} spaId
 * @returns {object[]}
 */
async function findBySpaId(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .order('asked_at', { ascending: true });

  if (error) throw new Error(`ClarificationThread.findBySpaId failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { create, recordAnswer, findBySpaId };
