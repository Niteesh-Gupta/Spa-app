'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SPA Workflow State Machine
//
// Defines every valid status and every valid transition between statuses.
// This is the single authoritative source of truth for what state changes
// are structurally allowed — business rules (e.g. which tier approves at
// which discount level) live in approvalEngine.js, not here.
//
// Clarification level naming:
//   L1 = RSM  (first approver)
//   L2 = ZSM
//   L3 = NSM
//   L4 = CM   (final approver)
// ─────────────────────────────────────────────────────────────────────────────

const STATUSES = Object.freeze({
  // ── Pre-approval ──────────────────────────────────────────────────────────
  DRAFT:                       'DRAFT',
  SUBMITTED:                   'SUBMITTED',

  // ── Approval chain ────────────────────────────────────────────────────────
  PENDING_RSM:                 'PENDING_RSM',
  PENDING_ZSM:                 'PENDING_ZSM',
  PENDING_NSM:                 'PENDING_NSM',
  PENDING_CM:                  'PENDING_CM',

  // ── Clarification (pause at current level, awaiting raiser response) ──────
  CLARIFICATION_REQUIRED_L1:   'CLARIFICATION_REQUIRED_L1',  // RSM asked
  CLARIFICATION_REQUIRED_L2:   'CLARIFICATION_REQUIRED_L2',  // ZSM asked
  CLARIFICATION_REQUIRED_L3:   'CLARIFICATION_REQUIRED_L3',  // NSM asked
  CLARIFICATION_REQUIRED_L4:   'CLARIFICATION_REQUIRED_L4',  // CM asked

  // ── Post-approval ─────────────────────────────────────────────────────────
  APPROVED:                    'APPROVED',
  PENDING_CONFIRMATION:        'PENDING_CONFIRMATION',
  CONFIRMED:                   'CONFIRMED',
  ACTIVE_CONTRACT:             'ACTIVE_CONTRACT',
  EXPIRING_SOON:               'EXPIRING_SOON',
  EXPIRED:                     'EXPIRED',

  // ── Exception states ──────────────────────────────────────────────────────
  REJECTED:                    'REJECTED',
  SUPERSEDED:                  'SUPERSEDED',
  WITHDRAWN:                   'WITHDRAWN',
  CLOSED:                      'CLOSED',
});

// ─────────────────────────────────────────────────────────────────────────────
// Transition map
//
// Each key is a "from" status. The array lists every valid "to" status.
// The approvalEngine and sdrWorkflow decide *which* valid transition to
// apply — this map only defines whether a transition is structurally allowed.
// ─────────────────────────────────────────────────────────────────────────────
const TRANSITIONS = Object.freeze({

  [STATUSES.DRAFT]: [
    STATUSES.SUBMITTED,
  ],

  // Auto-routes to RSM on submission — RSM is always the first approver
  [STATUSES.SUBMITTED]: [
    STATUSES.PENDING_RSM,
  ],

  // RSM approves:
  //   → APPROVED      if discount ≤ 15% (RSM is final for this band)
  //   → PENDING_ZSM   if discount > 15% (escalates)
  // RSM rejects       → REJECTED (goes back to TM/raiser)
  // RSM clarifies     → CLARIFICATION_REQUIRED_L1
  [STATUSES.PENDING_RSM]: [
    STATUSES.APPROVED,
    STATUSES.PENDING_ZSM,
    STATUSES.REJECTED,
    STATUSES.CLARIFICATION_REQUIRED_L1,
    STATUSES.SUPERSEDED,
    STATUSES.WITHDRAWN,
  ],

  // ZSM approves:
  //   → APPROVED      if discount ≤ 25% (ZSM is final for this band)
  //   → PENDING_NSM   if discount > 25%
  // ZSM rejects       → REJECTED (goes back to RSM)
  [STATUSES.PENDING_ZSM]: [
    STATUSES.APPROVED,
    STATUSES.PENDING_NSM,
    STATUSES.REJECTED,
    STATUSES.CLARIFICATION_REQUIRED_L2,
    STATUSES.SUPERSEDED,
    STATUSES.WITHDRAWN,
  ],

  // NSM approves:
  //   → APPROVED      if discount ≤ 35% (NSM is final for this band)
  //   → PENDING_CM    if discount > 35%
  // NSM rejects       → REJECTED (goes back to ZSM)
  [STATUSES.PENDING_NSM]: [
    STATUSES.APPROVED,
    STATUSES.PENDING_CM,
    STATUSES.REJECTED,
    STATUSES.CLARIFICATION_REQUIRED_L3,
    STATUSES.SUPERSEDED,
    STATUSES.WITHDRAWN,
  ],

  // CM is final approver (discount > 35%). No further escalation possible.
  // CM rejects        → REJECTED (goes back to NSM)
  [STATUSES.PENDING_CM]: [
    STATUSES.APPROVED,
    STATUSES.REJECTED,
    STATUSES.CLARIFICATION_REQUIRED_L4,
    STATUSES.SUPERSEDED,
    STATUSES.WITHDRAWN,
  ],

  // Clarification: raiser responds → goes back to the same approver level
  // Raiser may also choose to withdraw rather than respond
  [STATUSES.CLARIFICATION_REQUIRED_L1]: [
    STATUSES.PENDING_RSM,
    STATUSES.WITHDRAWN,
    STATUSES.SUPERSEDED,
  ],

  [STATUSES.CLARIFICATION_REQUIRED_L2]: [
    STATUSES.PENDING_ZSM,
    STATUSES.WITHDRAWN,
    STATUSES.SUPERSEDED,
  ],

  [STATUSES.CLARIFICATION_REQUIRED_L3]: [
    STATUSES.PENDING_NSM,
    STATUSES.WITHDRAWN,
    STATUSES.SUPERSEDED,
  ],

  [STATUSES.CLARIFICATION_REQUIRED_L4]: [
    STATUSES.PENDING_CM,
    STATUSES.WITHDRAWN,
    STATUSES.SUPERSEDED,
  ],

  // Final approval triggers the confirmation window
  [STATUSES.APPROVED]: [
    STATUSES.PENDING_CONFIRMATION,
    STATUSES.SUPERSEDED,
  ],

  // TM/RSM confirm hospital accepted → CONFIRMED
  // Window elapses without confirmation → EXPIRED
  // Hospital rejects the deal (TM/RSM raises fresh SPA) → SUPERSEDED
  // Raiser decides not to proceed → WITHDRAWN
  [STATUSES.PENDING_CONFIRMATION]: [
    STATUSES.CONFIRMED,
    STATUSES.EXPIRED,
    STATUSES.SUPERSEDED,
    STATUSES.WITHDRAWN,
  ],

  // Start date entered → contract frozen, PDF generated
  [STATUSES.CONFIRMED]: [
    STATUSES.ACTIVE_CONTRACT,
  ],

  // Scheduler transitions based on valid_till date
  [STATUSES.ACTIVE_CONTRACT]: [
    STATUSES.EXPIRING_SOON,   // scheduler: 30 days before valid_till
    STATUSES.EXPIRED,         // scheduler: on valid_till date
  ],

  [STATUSES.EXPIRING_SOON]: [
    STATUSES.EXPIRED,         // scheduler: on valid_till date
    STATUSES.ACTIVE_CONTRACT, // future: renewal extends contract
  ],

  // Rejection routes back to the prior level.
  // sdrWorkflow determines the correct target based on which level rejected
  // and whether the discount band has changed (see CLAUDE.md re-raise rules).
  // TM-level rejection (RSM rejected) allows WITHDRAWN.
  [STATUSES.REJECTED]: [
    STATUSES.PENDING_RSM,
    STATUSES.PENDING_ZSM,
    STATUSES.PENDING_NSM,
    STATUSES.PENDING_CM,
    STATUSES.WITHDRAWN,
    STATUSES.SUPERSEDED,
  ],

  // Terminal states — can only move to CLOSED (admin archive)
  [STATUSES.EXPIRED]: [
    STATUSES.CLOSED,
  ],

  [STATUSES.SUPERSEDED]: [
    STATUSES.CLOSED,
  ],

  [STATUSES.WITHDRAWN]: [
    STATUSES.CLOSED,
  ],

  // Fully terminal — no further transitions
  [STATUSES.CLOSED]: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if transitioning from `fromStatus` to `toStatus` is a
 * structurally valid move in the state machine.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
function isValidTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

/**
 * Returns the list of statuses that are reachable from `status`.
 * Returns an empty array for terminal states or unknown statuses.
 *
 * @param {string} status
 * @returns {string[]}
 */
function getValidTransitions(status) {
  return TRANSITIONS[status] ? [...TRANSITIONS[status]] : [];
}

/**
 * Returns true if `status` has no valid outgoing transitions (i.e. is a
 * fully terminal state with no further lifecycle moves possible).
 *
 * @param {string} status
 * @returns {boolean}
 */
function isTerminal(status) {
  const transitions = TRANSITIONS[status];
  return transitions !== undefined && transitions.length === 0;
}

/**
 * Returns true if `status` is a known status in this state machine.
 *
 * @param {string} status
 * @returns {boolean}
 */
function isKnownStatus(status) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, status);
}

module.exports = {
  STATUSES,
  isValidTransition,
  getValidTransitions,
  isTerminal,
  isKnownStatus,
};
