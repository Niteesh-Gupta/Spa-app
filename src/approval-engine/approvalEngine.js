'use strict';

const { STATUSES, isValidTransition } = require('../workflows/workflowEngine');
const {
  getNextApproverInChain,
  getPendingStatusForRole,
  getClarificationStatusForRole,
  getRejectionTargetRole,
  requiresSupplyChainNotification,
} = require('./approvalMatrix');

// ─────────────────────────────────────────────────────────────────────────────
// Approval Engine
//
// Decision layer for all approver and raiser actions.
// Given a SPA's current state + the actor + the action being taken, this
// engine validates authorization and returns what the new state should be.
//
// What this engine does NOT do:
//   - Persist state changes       → requestService / approvalService
//   - Send notifications          → notificationService
//   - Write audit entries         → auditLogService
//   - Handle re-raise routing     → sdrWorkflow (uses approvalMatrix directly)
//
// All action functions throw a descriptive Error on invalid input.
// On success they return a plain result object.
// sdrWorkflow wraps these calls, persists the result, and fires side-effects.
// ─────────────────────────────────────────────────────────────────────────────

// ── Static role mappings ──────────────────────────────────────────────────────

// Maps PENDING_* status → the one role authorized to approve/reject/clarify
const STATUS_TO_APPROVER_ROLE = Object.freeze({
  [STATUSES.PENDING_RSM]: 'RSM',
  [STATUSES.PENDING_ZSM]: 'ZSM',
  [STATUSES.PENDING_NSM]: 'NSM',
  [STATUSES.PENDING_CM]:  'CM',
});

// Maps CLARIFICATION_REQUIRED_L* → the PENDING_* status it resumes to.
// The approver who asked does not change — the SPA goes back to the same level.
const CLARIFICATION_TO_PENDING = Object.freeze({
  [STATUSES.CLARIFICATION_REQUIRED_L1]: STATUSES.PENDING_RSM,
  [STATUSES.CLARIFICATION_REQUIRED_L2]: STATUSES.PENDING_ZSM,
  [STATUSES.CLARIFICATION_REQUIRED_L3]: STATUSES.PENDING_NSM,
  [STATUSES.CLARIFICATION_REQUIRED_L4]: STATUSES.PENDING_CM,
});

// Roles that can raise SPAs and respond to clarifications / rejections
const RAISER_ROLES = new Set(['TM', 'RSM', 'TENDER_MANAGER']);

// Statuses from which a raiser can withdraw the SPA
const WITHDRAWABLE_STATUSES = new Set([
  STATUSES.PENDING_RSM,
  STATUSES.PENDING_ZSM,
  STATUSES.PENDING_NSM,
  STATUSES.PENDING_CM,
  STATUSES.CLARIFICATION_REQUIRED_L1,
  STATUSES.CLARIFICATION_REQUIRED_L2,
  STATUSES.CLARIFICATION_REQUIRED_L3,
  STATUSES.CLARIFICATION_REQUIRED_L4,
  STATUSES.REJECTED,
  STATUSES.PENDING_CONFIRMATION,
]);

// ── Internal guard ────────────────────────────────────────────────────────────

function _assertApproverAuthorized(currentStatus, actorRole) {
  const authorized = STATUS_TO_APPROVER_ROLE[currentStatus];
  if (!authorized) {
    throw new Error(
      `No approver action is valid in status "${currentStatus}".`
    );
  }
  if (actorRole !== authorized) {
    throw new Error(
      `Role "${actorRole}" is not authorized to act on a SPA in status "${currentStatus}". ` +
      `Expected role: "${authorized}".`
    );
  }
}

function _assertValidTransition(fromStatus, toStatus) {
  if (!isValidTransition(fromStatus, toStatus)) {
    throw new Error(
      `Invalid state transition: "${fromStatus}" → "${toStatus}".`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: Approve
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves an approval action.
 *
 * If the acting role is the final approver for the SPA's discount band,
 * the SPA moves to APPROVED. Otherwise it escalates to the next approver.
 *
 * After final approval on a >35% deal, Supply Chain must be notified.
 * The flag is returned here so sdrWorkflow can trigger the notification.
 *
 * @param {{ status: string, discountPct: number }} spa
 * @param {string} actorRole  e.g. 'RSM'
 * @returns {{ newStatus: string, supplyChainNotificationRequired: boolean }}
 */
function resolveApproval(spa, actorRole) {
  _assertApproverAuthorized(spa.status, actorRole);

  const nextApprover = getNextApproverInChain(actorRole, spa.discountPct);

  if (nextApprover === null) {
    // This role is final for the discount band — full approval
    _assertValidTransition(spa.status, STATUSES.APPROVED);
    return {
      newStatus: STATUSES.APPROVED,
      supplyChainNotificationRequired: requiresSupplyChainNotification(spa.discountPct),
    };
  }

  // Not final — escalate to next level in the chain
  const newStatus = getPendingStatusForRole(nextApprover);
  _assertValidTransition(spa.status, newStatus);
  return {
    newStatus,
    supplyChainNotificationRequired: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: Reject
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a rejection action.
 *
 * Status always moves to REJECTED. The `rejectedByRole` is stored so that
 * sdrWorkflow can use approvalMatrix.getReraiseTargetStatus() to route any
 * subsequent re-raise correctly.
 *
 * A mandatory reason must be supplied.
 *
 * @param {{ status: string }} spa
 * @param {string} actorRole
 * @param {string} reason  Mandatory — why is this being rejected?
 * @returns {{ newStatus: string, rejectedByRole: string, rejectionTargetRole: string, rejectionReason: string }}
 */
function resolveRejection(spa, actorRole, reason) {
  _assertApproverAuthorized(spa.status, actorRole);

  if (!reason || !reason.trim()) {
    throw new Error('Rejection reason is required and cannot be empty.');
  }

  _assertValidTransition(spa.status, STATUSES.REJECTED);

  return {
    newStatus:           STATUSES.REJECTED,
    rejectedByRole:      actorRole,
    // One level down — tells the receiving party who they are responding to
    rejectionTargetRole: getRejectionTargetRole(actorRole),
    rejectionReason:     reason.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: Request Clarification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a clarification request from an approver.
 *
 * SPA pauses at the current approval level. Status moves to
 * CLARIFICATION_REQUIRED_L* (where * matches the approver's level).
 * Goes to the raiser for a response; returns to the same approver on reply.
 *
 * A mandatory question must be supplied.
 *
 * @param {{ status: string }} spa
 * @param {string} actorRole
 * @param {string} question  Mandatory — what does the approver need to know?
 * @returns {{ newStatus: string, clarificationByRole: string, clarificationQuestion: string }}
 */
function resolveClarification(spa, actorRole, question) {
  _assertApproverAuthorized(spa.status, actorRole);

  if (!question || !question.trim()) {
    throw new Error('Clarification question is required and cannot be empty.');
  }

  const newStatus = getClarificationStatusForRole(actorRole);
  _assertValidTransition(spa.status, newStatus);

  return {
    newStatus,
    clarificationByRole:   actorRole,
    clarificationQuestion: question.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: Respond to Clarification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a raiser's response to a clarification request.
 *
 * SPA returns to the same approver who raised the clarification.
 * The approval level does not change — this is a pure pause/resume.
 *
 * @param {{ status: string }} spa
 * @param {string} actorRole  Must be a raiser role (TM / RSM / TENDER_MANAGER)
 * @param {string} response   The raiser's answer / additional information
 * @returns {{ newStatus: string, clarificationResponse: string }}
 */
function resolveClarificationResponse(spa, actorRole, response) {
  if (!RAISER_ROLES.has(actorRole)) {
    throw new Error(
      `Role "${actorRole}" is not authorized to respond to clarifications. ` +
      `Only raisers (TM, RSM, TENDER_MANAGER) may respond.`
    );
  }

  const newStatus = CLARIFICATION_TO_PENDING[spa.status];
  if (!newStatus) {
    throw new Error(
      `SPA is not in a clarification-required state. Current status: "${spa.status}".`
    );
  }

  if (!response || !response.trim()) {
    throw new Error('Clarification response is required and cannot be empty.');
  }

  _assertValidTransition(spa.status, newStatus);

  return {
    newStatus,
    clarificationResponse: response.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: Withdraw
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a withdrawal by the raiser.
 *
 * Can be triggered from most active states (see WITHDRAWABLE_STATUSES).
 * Typically used when:
 *   - Raiser no longer wishes to pursue the SPA mid-approval
 *   - RSM rejects and TM chooses not to re-raise → WITHDRAWN
 *
 * @param {{ status: string }} spa
 * @param {string} actorRole  Must be a raiser role
 * @returns {{ newStatus: string }}
 */
function resolveWithdrawal(spa, actorRole) {
  if (!RAISER_ROLES.has(actorRole)) {
    throw new Error(
      `Role "${actorRole}" is not authorized to withdraw a SPA.`
    );
  }

  if (!WITHDRAWABLE_STATUSES.has(spa.status)) {
    throw new Error(
      `A SPA in status "${spa.status}" cannot be withdrawn.`
    );
  }

  _assertValidTransition(spa.status, STATUSES.WITHDRAWN);

  return { newStatus: STATUSES.WITHDRAWN };
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers — used by controllers and UI to show/hide actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the role that is authorized to approve/reject/clarify a SPA
 * in the given status, or null if no approver action is valid here.
 *
 * @param {string} status
 * @returns {string|null}
 */
function getAuthorizedApproverRole(status) {
  return STATUS_TO_APPROVER_ROLE[status] || null;
}

/**
 * Returns the list of action names available to `actorRole` on `spa`.
 *
 * Used by the API layer to populate action buttons and guard endpoints.
 * Returned strings match the sdrWorkflow function names for consistency.
 *
 * @param {{ status: string, discountPct: number }} spa
 * @param {string} actorRole
 * @returns {string[]}
 */
function getAvailableActions(spa, actorRole) {
  const actions = [];
  const { status } = spa;

  // ── Approver actions ──────────────────────────────────────────────────────
  if (STATUS_TO_APPROVER_ROLE[status] === actorRole) {
    actions.push('approve', 'reject', 'requestClarification');
  }

  // ── Raiser actions ────────────────────────────────────────────────────────
  if (RAISER_ROLES.has(actorRole)) {
    // Respond to a pending clarification
    if (CLARIFICATION_TO_PENDING[status]) {
      actions.push('respondToClarification');
    }

    // Confirm hospital acceptance after final approval
    if (status === STATUSES.PENDING_CONFIRMATION) {
      actions.push('confirm');
    }

    // Re-raise after rejection, or simply withdraw
    if (status === STATUSES.REJECTED) {
      actions.push('reraise', 'withdraw');
    }

    // Withdraw from any withdrawable state (except REJECTED, covered above)
    if (WITHDRAWABLE_STATUSES.has(status) && status !== STATUSES.REJECTED) {
      actions.push('withdraw');
    }
  }

  return actions;
}

/**
 * Returns true if `actorRole` is permitted to perform `action` on `spa`.
 *
 * Lightweight guard for single-action checks in API middleware.
 *
 * @param {{ status: string, discountPct: number }} spa
 * @param {string} actorRole
 * @param {string} action
 * @returns {boolean}
 */
function canPerformAction(spa, actorRole, action) {
  return getAvailableActions(spa, actorRole).includes(action);
}

module.exports = {
  // Actions
  resolveApproval,
  resolveRejection,
  resolveClarification,
  resolveClarificationResponse,
  resolveWithdrawal,

  // Permission helpers
  getAuthorizedApproverRole,
  getAvailableActions,
  canPerformAction,

  // Exported for use in sdrWorkflow / tests
  RAISER_ROLES,
};
