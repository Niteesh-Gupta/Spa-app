'use strict';

const { STATUSES } = require('../workflows/workflowEngine');

// ─────────────────────────────────────────────────────────────────────────────
// Approval Matrix
//
// Single source of truth for discount thresholds, approval chains, and
// routing rules. All business logic that depends on "who approves at what
// discount level" is derived from MATRIX_CONFIG — do not hardcode thresholds
// elsewhere.
//
// To change a threshold: update MATRIX_CONFIG.bands only.
// Derived caches (ROLE_TO_PENDING, etc.) are rebuilt automatically from it.
// ─────────────────────────────────────────────────────────────────────────────

// ── Configurable thresholds ───────────────────────────────────────────────────
//
// bands must be ordered from lowest maxDiscount to highest.
// The last band must have maxDiscount: Infinity.
//
// chain: ordered list of approver roles, lowest to highest.
//   RSM is always first — no level skipping.
//   finalApprover is the last entry in the chain (the role that gives
//   final sign-off for that discount band).
//
// Total discount = dealer margin + DO discount on dealer price (DP).
// See CLAUDE.md "Total Discount Definition".

const MATRIX_CONFIG = Object.freeze({
  bands: [
    {
      id:             'RSM_BAND',
      label:          '≤ 15%',
      maxDiscount:    15,
      chain:          ['RSM'],
      finalApprover:  'RSM',
    },
    {
      id:             'ZSM_BAND',
      label:          '> 15% and ≤ 25%',
      maxDiscount:    25,
      chain:          ['RSM', 'ZSM'],
      finalApprover:  'ZSM',
    },
    {
      id:             'NSM_BAND',
      label:          '> 25% and ≤ 35%',
      maxDiscount:    35,
      chain:          ['RSM', 'ZSM', 'NSM'],
      finalApprover:  'NSM',
    },
    {
      id:             'CM_BAND',
      label:          '> 35%',
      maxDiscount:    Infinity,
      chain:          ['RSM', 'ZSM', 'NSM', 'CM'],
      finalApprover:  'CM',
    },
  ],

  // Deals above this threshold trigger a Supply Chain notification once
  // they reach ACTIVE_CONTRACT. Supply Chain does NOT approve — notification only.
  supplyChainNotificationThreshold: 35,
});

// ── Derived caches — built once from MATRIX_CONFIG ───────────────────────────

// Maps approver role → the PENDING_* status used when that role is reviewing
const ROLE_TO_PENDING_STATUS = Object.freeze({
  RSM: STATUSES.PENDING_RSM,
  ZSM: STATUSES.PENDING_ZSM,
  NSM: STATUSES.PENDING_NSM,
  CM:  STATUSES.PENDING_CM,
});

// Maps approver role → the CLARIFICATION_REQUIRED_L* status that role triggers
const ROLE_TO_CLARIFICATION_STATUS = Object.freeze({
  RSM: STATUSES.CLARIFICATION_REQUIRED_L1,
  ZSM: STATUSES.CLARIFICATION_REQUIRED_L2,
  NSM: STATUSES.CLARIFICATION_REQUIRED_L3,
  CM:  STATUSES.CLARIFICATION_REQUIRED_L4,
});

// Ordered list of approver roles (derived from the longest chain).
// Used for "back one level" rejection routing.
const ORDERED_APPROVER_CHAIN = MATRIX_CONFIG.bands[MATRIX_CONFIG.bands.length - 1].chain;

// Maps approver role → the role one level below it in the chain.
// Used to find where a rejection goes back to.
// RSM is the bottom of the approver chain — if RSM rejects, it goes to the raiser (TM/RSM).
const REJECTION_TARGET_ROLE = Object.freeze(
  ORDERED_APPROVER_CHAIN.reduce((map, role, idx) => {
    map[role] = idx === 0 ? 'RAISER' : ORDERED_APPROVER_CHAIN[idx - 1];
    return map;
  }, {})
);

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _getBand(discountPct) {
  for (const band of MATRIX_CONFIG.bands) {
    if (discountPct <= band.maxDiscount) return band;
  }
  // Unreachable — last band has maxDiscount: Infinity
  return MATRIX_CONFIG.bands[MATRIX_CONFIG.bands.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full band object for a given discount percentage.
 * Use this to compare bands (e.g. for re-raise routing logic).
 *
 * @param {number} discountPct  e.g. 22.5
 * @returns {{ id, label, maxDiscount, chain, finalApprover }}
 */
function getBandForDiscount(discountPct) {
  return _getBand(discountPct);
}

/**
 * Returns the ordered array of approver roles required for a given discount.
 * e.g. 28% → ['RSM', 'ZSM', 'NSM']
 *
 * @param {number} discountPct
 * @returns {string[]}
 */
function getApprovalChain(discountPct) {
  return [..._getBand(discountPct).chain];
}

/**
 * Returns the role of the final approver for a given discount.
 * e.g. 28% → 'NSM'
 *
 * @param {number} discountPct
 * @returns {string}
 */
function getFinalApprover(discountPct) {
  return _getBand(discountPct).finalApprover;
}

/**
 * Returns the next approver role in the chain after `currentRole` for a
 * given discount. Returns null if `currentRole` is the final approver
 * (i.e. no further escalation needed).
 *
 * Used by sdrWorkflow to decide: PENDING_RSM → APPROVED or PENDING_ZSM?
 *
 * @param {string} currentRole   e.g. 'RSM'
 * @param {number} discountPct
 * @returns {string|null}
 */
function getNextApproverInChain(currentRole, discountPct) {
  const chain = _getBand(discountPct).chain;
  const idx = chain.indexOf(currentRole);
  if (idx === -1 || idx === chain.length - 1) return null;
  return chain[idx + 1];
}

/**
 * Returns the PENDING_* status for the given approver role.
 * e.g. 'ZSM' → 'PENDING_ZSM'
 *
 * @param {string} role
 * @returns {string}
 * @throws if role is not a known approver
 */
function getPendingStatusForRole(role) {
  const status = ROLE_TO_PENDING_STATUS[role];
  if (!status) throw new Error(`No pending status defined for role: ${role}`);
  return status;
}

/**
 * Returns the CLARIFICATION_REQUIRED_L* status for the given approver role.
 * e.g. 'ZSM' → 'CLARIFICATION_REQUIRED_L2'
 *
 * @param {string} role
 * @returns {string}
 * @throws if role is not a known approver
 */
function getClarificationStatusForRole(role) {
  const status = ROLE_TO_CLARIFICATION_STATUS[role];
  if (!status) throw new Error(`No clarification status defined for role: ${role}`);
  return status;
}

/**
 * Returns the role that receives the SPA when `rejectingRole` rejects it.
 * Returns the string 'RAISER' when RSM rejects (goes back to TM/raiser —
 * the raiser then decides to re-raise or withdraw).
 *
 * e.g. 'NSM' → 'ZSM'
 *      'RSM' → 'RAISER'
 *
 * @param {string} rejectingRole
 * @returns {string}
 * @throws if rejectingRole is not a known approver
 */
function getRejectionTargetRole(rejectingRole) {
  const target = REJECTION_TARGET_ROLE[rejectingRole];
  if (target === undefined) throw new Error(`No rejection target defined for role: ${rejectingRole}`);
  return target;
}

/**
 * Determines the correct target PENDING_* status after a re-raise.
 *
 * Rules (from CLAUDE.md):
 *   - Discount band unchanged or moved to a lower band that still includes
 *     the rejecting role → SPA goes directly back to that rejector.
 *     Intermediate levels do not re-approve.
 *   - Discount changed into a different band that no longer includes the
 *     rejecting role → full chain restart from PENDING_RSM.
 *
 * @param {string} rejectingRole     Role that rejected (e.g. 'ZSM')
 * @param {number} newDiscountPct    Discount on the re-raised SPA
 * @returns {string}                 PENDING_* status to route to
 */
function getReraiseTargetStatus(rejectingRole, newDiscountPct) {
  const newChain = getApprovalChain(newDiscountPct);
  if (newChain.includes(rejectingRole)) {
    // Rejector is still in the chain for the new discount — go back to them
    return getPendingStatusForRole(rejectingRole);
  }
  // Discount band changed such that the rejector is no longer in the chain
  // (e.g. TM revised price up to a lower band after ZSM rejection).
  // Restart from the beginning of the new chain — always RSM.
  return STATUSES.PENDING_RSM;
}

/**
 * Returns true if the discount exceeds the Supply Chain notification
 * threshold. These deals trigger an SC notification once they reach
 * ACTIVE_CONTRACT. SC does NOT approve.
 *
 * @param {number} discountPct
 * @returns {boolean}
 */
function requiresSupplyChainNotification(discountPct) {
  return discountPct > MATRIX_CONFIG.supplyChainNotificationThreshold;
}

/**
 * Returns the full matrix config. Useful for building reference UI
 * (e.g. the Approval Tiers page) without duplicating threshold values.
 *
 * @returns {object}
 */
function getMatrixConfig() {
  return MATRIX_CONFIG;
}

module.exports = {
  getBandForDiscount,
  getApprovalChain,
  getFinalApprover,
  getNextApproverInChain,
  getPendingStatusForRole,
  getClarificationStatusForRole,
  getRejectionTargetRole,
  getReraiseTargetStatus,
  requiresSupplyChainNotification,
  getMatrixConfig,
};
