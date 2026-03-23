'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Service — STUB
//
// Every workflow action must call log(). Entries are immutable — no updates,
// no deletes. In production this writes to the audit_log DB table.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   spaId:      string,
 *   actor:      { id: string, name: string, role: string },
 *   action:     string,   // e.g. 'SUBMIT', 'APPROVE', 'REJECT', 'CLARIFY'
 *   oldStatus:  string|null,
 *   newStatus:  string,
 *   metadata:   object
 * }} entry
 */
async function log(entry) {
  const timestamp = new Date().toISOString();
  console.log('[AUDIT]', timestamp, JSON.stringify({
    spaId:     entry.spaId,
    actor:     entry.actor,
    action:    entry.action,
    oldStatus: entry.oldStatus,
    newStatus: entry.newStatus,
    metadata:  entry.metadata || {},
  }));
}

module.exports = { log };
