'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AuditLog model — table: audit_log
//
// Immutable — insert only. No updates, no deletes.
// Interface matches auditLogService.log().
// ─────────────────────────────────────────────────────────────────────────────

const db                  = require('../db/supabaseClient');
const { toCamelList }     = require('../db/mappers');

const TABLE = 'audit_log';

/**
 * @param {{
 *   spaId:      string,
 *   actor:      { id: string, name: string, role: string },
 *   action:     string,
 *   oldStatus:  string|null,
 *   newStatus:  string,
 *   metadata:   object
 * }} entry
 */
async function log(entry) {
  const row = {
    spa_id:     entry.spaId,
    actor_id:   entry.actor.id,
    actor_name: entry.actor.name,
    actor_role: entry.actor.role,
    action:     entry.action,
    old_status: entry.oldStatus || null,
    new_status: entry.newStatus,
    metadata:   entry.metadata || {},
  };

  const { error } = await db.from(TABLE).insert(row);
  if (error) throw new Error(`AuditLog.log failed: ${error.message}`);
}

/**
 * Returns the full audit trail for a SPA, oldest first.
 * @param {string} spaId
 * @returns {object[]}
 */
async function findBySpaId(spaId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('spa_id', spaId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`AuditLog.findBySpaId failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { log, findBySpaId };
