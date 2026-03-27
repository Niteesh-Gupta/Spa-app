'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Approval Service — STUB
//
// Records each individual approval decision against a SPA.
// In production this writes to the approval_records DB table and provides
// the full approval chain history for any SPA.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   spaId:     string,
 *   actor:     { id: string, name: string, role: string },
 *   action:    string,   // 'APPROVE' | 'REJECT' | 'CLARIFY' | 'RESPOND' | 'WITHDRAW'
 *   result:    object,   // the engine result object
 *   metadata:  object
 * }} record
 */
async function recordDecision(record) {
  console.log('[APPROVAL_RECORD]', JSON.stringify({
    spaId:    record.spaId,
    actor:    record.actor,
    action:   record.action,
    result:   record.result,
    metadata: record.metadata || {},
    ts:       new Date().toISOString(),
  }));
}

module.exports = { recordDecision };
