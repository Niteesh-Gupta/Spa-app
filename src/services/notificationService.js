'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Notification Service — STUB
//
// All events are stubbed — real SMTP / n8n webhook to be wired later.
// Each function signature is final; only the implementation body changes
// when the real transport is connected.
// ─────────────────────────────────────────────────────────────────────────────

function _stub(event, payload) {
  console.log('[NOTIFY]', event, JSON.stringify(payload));
}

/**
 * Notify the next approver in the chain that a SPA is awaiting their review.
 * @param {object} spa
 * @param {string} approverRole  e.g. 'RSM'
 */
async function notifyApproverPending(spa, approverRole) {
  _stub('APPROVER_PENDING', { spaId: spa.id, approverRole, account: spa.accountName });
}

/**
 * Notify the rejection target (one level below rejector) and the raiser
 * that the SPA has been rejected and requires a response.
 * @param {object} spa
 * @param {{ rejectedByRole: string, rejectionTargetRole: string, rejectionReason: string }} details
 */
async function notifyRaiserRejection(spa, details) {
  _stub('REJECTION', { spaId: spa.id, ...details, account: spa.accountName });
}

/**
 * Notify the raiser that an approver has raised a clarification and needs
 * additional information before making a decision.
 * @param {object} spa
 * @param {{ clarificationByRole: string, clarificationQuestion: string }} details
 */
async function notifyRaiserClarification(spa, details) {
  _stub('CLARIFICATION_REQUIRED', { spaId: spa.id, ...details, account: spa.accountName });
}

/**
 * Notify the approver who raised the clarification that the raiser has
 * responded and the SPA is back in their queue.
 * @param {object} spa
 * @param {string} approverRole  Role to notify
 */
async function notifyApproverClarificationResponse(spa, approverRole) {
  _stub('CLARIFICATION_RESPONSE', { spaId: spa.id, approverRole, account: spa.accountName });
}

/**
 * Notify TM/RSM that their SPA has received final approval and the
 * confirmation window is now open.
 * @param {object} spa
 */
async function notifyConfirmationRequired(spa) {
  _stub('CONFIRMATION_REQUIRED', {
    spaId:               spa.id,
    account:             spa.accountName,
    confirmationDeadline: spa.confirmationDeadline,
  });
}

/**
 * Notify Supply Chain that a >35% deal has reached ACTIVE_CONTRACT.
 * SC uses the SPA reference number to verify credit note requests.
 * Supply Chain does NOT approve — this is visibility only.
 * @param {object} spa
 */
async function notifySupplyChain(spa) {
  _stub('SUPPLY_CHAIN_ACTIVE_CONTRACT', {
    spaId:          spa.id,
    account:        spa.accountName,
    discountPct:    spa.discountPct,
    approvedPrice:  spa.priceToBeQuoted,
    validFrom:      spa.contractStartDate,
    validTill:      spa.contractEndDate,
  });
}

/**
 * Notify all relevant stakeholders that the contract has been frozen and
 * the master record is live.
 * @param {object} spa
 */
async function notifyContractFrozen(spa) {
  _stub('CONTRACT_FROZEN', {
    spaId:      spa.id,
    account:    spa.accountName,
    validFrom:  spa.contractStartDate,
    validTill:  spa.contractEndDate,
  });
}

/**
 * Notify TM/RSM that the hospital has rejected the deal, prompting them
 * to re-raise with revised terms if they wish to proceed.
 * @param {object} spa
 */
async function notifyHospitalRejection(spa) {
  _stub('HOSPITAL_REJECTION', { spaId: spa.id, account: spa.accountName });
}

/**
 * Notify the raiser (and RSM if raiser is TM) that the contract is
 * approaching its expiry date.
 * @param {object} spa
 * @param {number} daysUntilExpiry  30 | 15 | 7
 */
async function notifyExpiryAlert(spa, daysUntilExpiry) {
  const urgency = daysUntilExpiry <= 7 ? 'CRITICAL' : daysUntilExpiry <= 15 ? 'URGENT' : 'RENEWAL_PROMPT';
  _stub('EXPIRY_ALERT', {
    spaId:          spa.id,
    account:        spa.accountName,
    daysUntilExpiry,
    urgency,
    contractEndDate: spa.contractEndDate,
  });
}

module.exports = {
  notifyApproverPending,
  notifyRaiserRejection,
  notifyRaiserClarification,
  notifyApproverClarificationResponse,
  notifyConfirmationRequired,
  notifySupplyChain,
  notifyContractFrozen,
  notifyHospitalRejection,
  notifyExpiryAlert,
};
