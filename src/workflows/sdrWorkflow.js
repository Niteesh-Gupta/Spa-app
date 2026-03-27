'use strict';

const { STATUSES } = require('./workflowEngine');
const {
  resolveApproval,
  resolveRejection,
  resolveClarification,
  resolveClarificationResponse,
  resolveWithdrawal,
  getAuthorizedApproverRole,
  RAISER_ROLES,
} = require('../approval-engine/approvalEngine');
const {
  getReraiseTargetStatus,
  requiresSupplyChainNotification,
} = require('../approval-engine/approvalMatrix');

const requestService      = require('../services/requestService');
const approvalService     = require('../services/approvalService');
const auditLogService     = require('../services/auditLogService');
const notificationService = require('../services/notificationService');

// ─────────────────────────────────────────────────────────────────────────────
// SDR Workflow Orchestrator
//
// Every user-facing action flows through here.
// Pattern for each function:
//   1. Load SPA + validate preconditions
//   2. Call approvalEngine (pure decision — no side-effects)
//   3. Persist new state via requestService
//   4. Record decision via approvalService (where relevant)
//   5. Write immutable audit log entry
//   6. Fire notification stubs
//
// This module does NOT implement business rules — those live in approvalEngine
// and approvalMatrix. It orchestrates persistence and side-effects only.
// ─────────────────────────────────────────────────────────────────────────────

// ── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Confirmation window in days — user-configurable between 5 and 10
  confirmationWindowDays: 7,

  // Expiry alert thresholds in days (scheduler uses these)
  expiryAlertDays: [30, 15, 7],
};

// ── Reference number counter (stub) ──────────────────────────────────────────
// In production this must be a DB sequence or atomic counter to prevent
// duplicates under concurrent load.
let _seqCounter = 1;

function _generateReferenceNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const seq  = String(_seqCounter++).padStart(5, '0');
  return `SDR-${yyyy}-${mm}-${seq}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _loadSpa(spaId) {
  const spa = await requestService.findById(spaId);
  if (!spa) throw new Error(`SPA "${spaId}" not found.`);
  return spa;
}

// Marks all active non-frozen SPAs for the same account + product SUPERSEDED.
// Called on submit and re-raise to enforce the stale-approval rule:
// only one live SPA per account + product combination.
async function _supersedePriorSpas(accountName, productId, excludeId, actor) {
  const active = await requestService.findActiveByAccountAndProduct(
    accountName, productId, excludeId
  );
  for (const prior of active) {
    await requestService.update(prior.id, {
      status:    STATUSES.SUPERSEDED,
      updatedAt: new Date(),
    });
    await auditLogService.log({
      spaId:     prior.id,
      actor:     { id: 'SYSTEM', name: 'System', role: 'SYSTEM' },
      action:    'SUPERSEDE',
      oldStatus: prior.status,
      newStatus: STATUSES.SUPERSEDED,
      metadata:  { reason: 'New SPA submitted for same account + product', supersededBy: actor.id },
    });
  }
}

// Stub for PDF generation — fires after contract is frozen.
// Replace with real PDF service call when available.
async function _triggerPdfGeneration(spa) {
  console.log('[PDF_STUB] Generate final contract PDF for', spa.id, '—', spa.accountName);
}

function _computeDiscountPct(standardPrice, priceToBeQuoted) {
  if (!standardPrice || standardPrice <= 0) throw new Error('Standard price must be a positive number.');
  if (priceToBeQuoted < 0)                  throw new Error('Requested price cannot be negative.');
  if (priceToBeQuoted > standardPrice)      throw new Error('Requested price cannot exceed standard price.');
  return parseFloat((((standardPrice - priceToBeQuoted) / standardPrice) * 100).toFixed(4));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUBMIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TM / RSM / TENDER_MANAGER submits a new SPA request.
 *
 * - Generates SDR-YYYY-MM-NNNNN reference number
 * - Auto-supersedes any prior active SPA for the same account + product
 * - Routes directly to PENDING_RSM (RSM is always first approver)
 * - Notifies RSM
 *
 * @param {{
 *   dealerName:           string,
 *   accountName:          string,
 *   customerDetails:      object,
 *   productDetails:       string|object,  // SKU or product object
 *   quantity:             number,
 *   priceToBeQuoted:      number,
 *   standardPrice:        number,
 *   volume:               number,
 *   expectedBusiness:     number|null,
 *   businessJustification:string,
 *   otherDetails:         string|null,
 *   linkedTo:             string|null     // set by reraise(), null for fresh submissions
 * }} spaData
 * @param {{ id: string, name: string, role: string }} actor
 * @returns {object}  The created SPA
 */
async function submit(spaData, actor) {
  if (!RAISER_ROLES.has(actor.role)) {
    throw new Error(`Role "${actor.role}" is not permitted to submit SPAs.`);
  }

  const { dealerName, accountName, productDetails, quantity,
          priceToBeQuoted, standardPrice, businessJustification } = spaData;

  if (!dealerName)            throw new Error('Dealer name is required.');
  if (!accountName)           throw new Error('Account name is required.');
  if (!productDetails)        throw new Error('Product details are required.');
  if (!quantity || quantity < 1) throw new Error('Quantity must be a positive integer.');
  if (!priceToBeQuoted)       throw new Error('Price to be quoted is required.');
  if (!standardPrice)         throw new Error('Standard price is required.');
  if (!businessJustification) throw new Error('Business justification is required.');

  const discountPct = _computeDiscountPct(standardPrice, priceToBeQuoted);
  const referenceId = _generateReferenceNumber();
  const now         = new Date();

  // Extract product id for duplicate check
  const productId = typeof productDetails === 'string'
    ? productDetails
    : (productDetails.id || productDetails.sku || JSON.stringify(productDetails));

  // Supersede any existing active SPAs for this account + product
  await _supersedePriorSpas(accountName, productId, null, actor);

  // Create SPA — SUBMITTED auto-routes immediately to PENDING_RSM
  const spa = await requestService.create({
    id:                   referenceId,
    status:               STATUSES.PENDING_RSM,
    discountPct,

    raisedByRole:         actor.role,
    raisedById:           actor.id,
    raisedByName:         actor.name,

    dealerName,
    accountName,
    customerDetails:      spaData.customerDetails      || {},
    productDetails,
    quantity,
    priceToBeQuoted,
    standardPrice,
    volume:               spaData.volume               || quantity,
    expectedBusiness:     spaData.expectedBusiness     || null,
    businessJustification,
    otherDetails:         spaData.otherDetails         || null,

    // Approval tracking fields — populated by workflow actions
    rejectedByRole:       null,
    rejectionReason:      null,
    rejectionTargetRole:  null,
    clarificationByRole:  null,
    clarificationQuestion:null,

    // Contract fields — populated on confirm()
    contractStartDate:    null,
    contractEndDate:      null,
    confirmedAt:          null,
    confirmationDeadline: null,
    approvedAt:           null,

    // Chain linkage — set by reraise(), null for fresh submissions
    linkedTo:             spaData.linkedTo || null,

    submittedAt:          now,
    createdAt:            now,
    updatedAt:            now,
  });

  await auditLogService.log({
    spaId:     spa.id,
    actor,
    action:    'SUBMIT',
    oldStatus: null,
    newStatus: STATUSES.PENDING_RSM,
    metadata:  { discountPct, dealerName, accountName },
  });

  await notificationService.notifyApproverPending(spa, 'RSM');

  return spa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. APPROVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An approver approves the SPA at their level.
 *
 * If the approver is the final approver for the discount band:
 *   → APPROVED, confirmation window opens, raiser notified.
 *   → If discount > 35%, Supply Chain notification queued for ACTIVE_CONTRACT.
 *
 * If not final:
 *   → Escalated to next approver level.
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor
 * @returns {object}  Updated SPA
 */
async function approve(spaId, actor) {
  const spa    = await _loadSpa(spaId);
  const result = resolveApproval(spa, actor.role);
  const now    = new Date();

  const changes = { status: result.newStatus, updatedAt: now };

  if (result.newStatus === STATUSES.APPROVED) {
    // Set the confirmation window deadline
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + CONFIG.confirmationWindowDays);
    changes.approvedAt            = now;
    changes.confirmationDeadline  = deadline;
  }

  const updatedSpa = await requestService.update(spaId, changes);

  await approvalService.recordDecision({
    spaId,
    actor,
    action:   'APPROVE',
    result,
    metadata: { discountPct: spa.discountPct },
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'APPROVE',
    oldStatus: spa.status,
    newStatus: result.newStatus,
    metadata:  { discountPct: spa.discountPct, escalatedTo: result.newStatus },
  });

  if (result.newStatus === STATUSES.APPROVED) {
    await notificationService.notifyConfirmationRequired(updatedSpa);
    // SC notification fires on ACTIVE_CONTRACT (after confirmation), not here.
    // Flag is stored on result so confirm() can act on it.
    // We store the flag on the SPA so confirm() doesn't need to re-derive it.
    await requestService.update(spaId, {
      supplyChainNotificationRequired: result.supplyChainNotificationRequired,
    });
  } else {
    // Escalated — notify next approver
    const nextRole = getAuthorizedApproverRole(result.newStatus);
    await notificationService.notifyApproverPending(updatedSpa, nextRole);
  }

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REJECT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An approver rejects the SPA.
 *
 * Status → REJECTED. Not terminal — the receiving party (one level down)
 * must respond. TM/raiser can choose to re-raise or withdraw.
 *
 * A mandatory reason must be provided.
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor
 * @param {string} reason
 * @returns {object}  Updated SPA
 */
async function reject(spaId, actor, reason) {
  const spa    = await _loadSpa(spaId);
  const result = resolveRejection(spa, actor.role, reason);

  const updatedSpa = await requestService.update(spaId, {
    status:             result.newStatus,
    rejectedByRole:     result.rejectedByRole,
    rejectionReason:    result.rejectionReason,
    rejectionTargetRole:result.rejectionTargetRole,
    updatedAt:          new Date(),
  });

  await approvalService.recordDecision({
    spaId,
    actor,
    action:   'REJECT',
    result,
    metadata: { reason: result.rejectionReason },
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'REJECT',
    oldStatus: spa.status,
    newStatus: result.newStatus,
    metadata:  {
      rejectedByRole:      result.rejectedByRole,
      rejectionTargetRole: result.rejectionTargetRole,
      reason:              result.rejectionReason,
    },
  });

  await notificationService.notifyRaiserRejection(updatedSpa, {
    rejectedByRole:      result.rejectedByRole,
    rejectionTargetRole: result.rejectionTargetRole,
    rejectionReason:     result.rejectionReason,
  });

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REQUEST CLARIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An approver pauses the SPA to request additional information from the raiser.
 *
 * SPA status → CLARIFICATION_REQUIRED_L* (tagged to the approver's level).
 * Goes to the raiser. Returns to the same approver on response.
 * A mandatory question must be provided.
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor
 * @param {string} question
 * @returns {object}  Updated SPA
 */
async function requestClarification(spaId, actor, question) {
  const spa    = await _loadSpa(spaId);
  const result = resolveClarification(spa, actor.role, question);

  const updatedSpa = await requestService.update(spaId, {
    status:                result.newStatus,
    clarificationByRole:   result.clarificationByRole,
    clarificationQuestion: result.clarificationQuestion,
    updatedAt:             new Date(),
  });

  await approvalService.recordDecision({
    spaId,
    actor,
    action:   'CLARIFY',
    result,
    metadata: { question: result.clarificationQuestion },
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'CLARIFY',
    oldStatus: spa.status,
    newStatus: result.newStatus,
    metadata:  { clarificationByRole: result.clarificationByRole, question: result.clarificationQuestion },
  });

  await notificationService.notifyRaiserClarification(updatedSpa, {
    clarificationByRole:   result.clarificationByRole,
    clarificationQuestion: result.clarificationQuestion,
  });

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RESPOND TO CLARIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The raiser responds to a clarification request.
 *
 * SPA returns to the same approver who asked — no level change.
 * A mandatory response must be provided.
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor  Must be a raiser
 * @param {string} response
 * @returns {object}  Updated SPA
 */
async function respondToClarification(spaId, actor, response) {
  const spa    = await _loadSpa(spaId);
  const result = resolveClarificationResponse(spa, actor.role, response);

  const updatedSpa = await requestService.update(spaId, {
    status:                result.newStatus,
    clarificationResponse: result.clarificationResponse,
    // Keep clarificationByRole intact so the approver knows their context
    updatedAt:             new Date(),
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'CLARIFICATION_RESPONSE',
    oldStatus: spa.status,
    newStatus: result.newStatus,
    metadata:  { response: result.clarificationResponse },
  });

  // Notify the approver who raised the clarification
  const approverRole = getAuthorizedApproverRole(result.newStatus);
  if (approverRole) {
    await notificationService.notifyApproverClarificationResponse(updatedSpa, approverRole);
  }

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WITHDRAW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The raiser withdraws the SPA.
 *
 * Can be called from most active states. Typically used when:
 *   - Raiser no longer wishes to pursue the deal
 *   - RSM rejected and TM chooses not to re-raise
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor
 * @returns {object}  Updated SPA
 */
async function withdraw(spaId, actor) {
  const spa    = await _loadSpa(spaId);
  const result = resolveWithdrawal(spa, actor.role);

  const updatedSpa = await requestService.update(spaId, {
    status:    result.newStatus,
    updatedAt: new Date(),
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'WITHDRAW',
    oldStatus: spa.status,
    newStatus: result.newStatus,
    metadata:  {},
  });

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONFIRM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TM/RSM confirms that the hospital has accepted the deal.
 *
 * Requires the contract start and end dates. Once confirmed:
 *   PENDING_CONFIRMATION → CONFIRMED → ACTIVE_CONTRACT (auto, immediate)
 *   PDF generated.
 *   Supply Chain notified if discount > 35%.
 *   All stakeholders notified of contract freeze.
 *
 * Note: Two state transitions happen inside this one user action.
 * Both are logged separately in the audit trail.
 *
 * Future: link confirmation record to historical contracts when legacy
 * data is available. Flag: LEGACY_CONTRACT_LINK — not built now.
 *
 * @param {string} spaId
 * @param {{ id: string, name: string, role: string }} actor
 * @param {{ contractStartDate: Date|string, contractEndDate: Date|string }} dates
 * @returns {object}  Updated SPA (ACTIVE_CONTRACT)
 */
async function confirm(spaId, actor, { contractStartDate, contractEndDate }) {
  if (!RAISER_ROLES.has(actor.role)) {
    throw new Error(`Role "${actor.role}" is not permitted to confirm SPAs.`);
  }

  const spa = await _loadSpa(spaId);

  if (spa.status !== STATUSES.PENDING_CONFIRMATION) {
    throw new Error(
      `SPA "${spaId}" is not awaiting confirmation. Current status: "${spa.status}".`
    );
  }

  if (!contractStartDate) throw new Error('Contract start date is required.');
  if (!contractEndDate)   throw new Error('Contract end date is required.');

  const startDate = new Date(contractStartDate);
  const endDate   = new Date(contractEndDate);

  if (isNaN(startDate.getTime())) throw new Error('Contract start date is invalid.');
  if (isNaN(endDate.getTime()))   throw new Error('Contract end date is invalid.');
  if (endDate <= startDate)       throw new Error('Contract end date must be after start date.');

  // Check the confirmation window has not already elapsed
  if (spa.confirmationDeadline && new Date() > new Date(spa.confirmationDeadline)) {
    throw new Error(
      `Confirmation window for SPA "${spaId}" has expired. ` +
      `The SPA will be marked EXPIRED by the scheduler.`
    );
  }

  const now = new Date();

  // Step 1: PENDING_CONFIRMATION → CONFIRMED
  await requestService.update(spaId, {
    status:            STATUSES.CONFIRMED,
    contractStartDate: startDate,
    contractEndDate:   endDate,
    confirmedAt:       now,
    updatedAt:         now,
  });

  await auditLogService.log({
    spaId,
    actor,
    action:    'CONFIRM',
    oldStatus: STATUSES.PENDING_CONFIRMATION,
    newStatus: STATUSES.CONFIRMED,
    metadata:  { contractStartDate: startDate, contractEndDate: endDate },
  });

  // Step 2: CONFIRMED → ACTIVE_CONTRACT (automatic — no user action)
  const activeSpa = await requestService.update(spaId, {
    status:    STATUSES.ACTIVE_CONTRACT,
    updatedAt: new Date(),
  });

  await auditLogService.log({
    spaId,
    actor:     { id: 'SYSTEM', name: 'System', role: 'SYSTEM' },
    action:    'ACTIVATE',
    oldStatus: STATUSES.CONFIRMED,
    newStatus: STATUSES.ACTIVE_CONTRACT,
    metadata:  { auto: true },
  });

  // PDF — fires after confirmation + dates entered (not on approval)
  await _triggerPdfGeneration(activeSpa);

  // SC notification — only for deals where discount > 35%
  if (activeSpa.supplyChainNotificationRequired ||
      requiresSupplyChainNotification(activeSpa.discountPct)) {
    await notificationService.notifySupplyChain(activeSpa);
  }

  await notificationService.notifyContractFrozen(activeSpa);

  return activeSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. RE-RAISE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raiser re-raises a rejected SPA with revised terms.
 *
 * Routing rules (from approvalMatrix.getReraiseTargetStatus):
 *   - Discount band unchanged or lower, rejector still in new chain
 *     → SPA goes directly back to that rejector (no re-approval by intermediaries)
 *   - Discount changed to a band that no longer includes the rejector
 *     → Full chain restart from PENDING_RSM
 *
 * The original REJECTED SPA is marked SUPERSEDED.
 * New SPA is created with linkedTo pointing to the original.
 *
 * @param {string} originalSpaId   The REJECTED SPA being re-raised
 * @param {{ id: string, name: string, role: string }} actor
 * @param {{
 *   priceToBeQuoted:      number,   // Required — the revised price
 *   businessJustification:string,   // Required — updated justification
 *   standardPrice:        number,   // Optional — inherit from original if omitted
 *   quantity:             number,
 *   volume:               number,
 *   dealerName:           string,
 *   customerDetails:      object,
 *   productDetails:       string|object,
 *   expectedBusiness:     number|null,
 *   otherDetails:         string|null,
 * }} newSpaData
 * @returns {object}  The newly created SPA
 */
async function reraise(originalSpaId, actor, newSpaData) {
  if (!RAISER_ROLES.has(actor.role)) {
    throw new Error(`Role "${actor.role}" is not permitted to re-raise SPAs.`);
  }

  const originalSpa = await _loadSpa(originalSpaId);

  if (originalSpa.status !== STATUSES.REJECTED) {
    throw new Error(
      `SPA "${originalSpaId}" is not in REJECTED status. Cannot re-raise. ` +
      `Current status: "${originalSpa.status}".`
    );
  }

  if (!newSpaData.priceToBeQuoted)       throw new Error('Revised price is required for re-raise.');
  if (!newSpaData.businessJustification) throw new Error('Updated justification is required for re-raise.');

  const standardPrice   = newSpaData.standardPrice || originalSpa.standardPrice;
  const newDiscountPct  = _computeDiscountPct(standardPrice, newSpaData.priceToBeQuoted);
  const targetStatus    = getReraiseTargetStatus(originalSpa.rejectedByRole, newDiscountPct);
  const referenceId     = _generateReferenceNumber();
  const now             = new Date();

  // Mark original as SUPERSEDED
  await requestService.update(originalSpaId, {
    status:    STATUSES.SUPERSEDED,
    updatedAt: now,
  });

  await auditLogService.log({
    spaId:     originalSpaId,
    actor:     { id: 'SYSTEM', name: 'System', role: 'SYSTEM' },
    action:    'SUPERSEDE',
    oldStatus: STATUSES.REJECTED,
    newStatus: STATUSES.SUPERSEDED,
    metadata:  { reason: 'Re-raised by raiser', reraiseActor: actor.id },
  });

  // Build new SPA — inherit original data, override with revised fields
  const newSpa = await requestService.create({
    id:                   referenceId,
    status:               targetStatus,
    discountPct:          newDiscountPct,

    raisedByRole:         actor.role,
    raisedById:           actor.id,
    raisedByName:         actor.name,

    dealerName:           newSpaData.dealerName           || originalSpa.dealerName,
    accountName:          originalSpa.accountName,         // account does not change on re-raise
    customerDetails:      newSpaData.customerDetails       || originalSpa.customerDetails,
    productDetails:       newSpaData.productDetails        || originalSpa.productDetails,
    quantity:             newSpaData.quantity              || originalSpa.quantity,
    priceToBeQuoted:      newSpaData.priceToBeQuoted,
    standardPrice,
    volume:               newSpaData.volume                || originalSpa.volume,
    expectedBusiness:     newSpaData.expectedBusiness      || originalSpa.expectedBusiness,
    businessJustification:newSpaData.businessJustification,
    otherDetails:         newSpaData.otherDetails          || originalSpa.otherDetails,

    rejectedByRole:       null,
    rejectionReason:      null,
    rejectionTargetRole:  null,
    clarificationByRole:  null,
    clarificationQuestion:null,

    linkedTo:             originalSpaId,

    contractStartDate:    null,
    contractEndDate:      null,
    confirmedAt:          null,
    confirmationDeadline: null,
    approvedAt:           null,

    submittedAt:          now,
    createdAt:            now,
    updatedAt:            now,
  });

  await auditLogService.log({
    spaId:     newSpa.id,
    actor,
    action:    'RERAISE',
    oldStatus: null,
    newStatus: targetStatus,
    metadata:  {
      originalSpaId,
      rejectedByRole:  originalSpa.rejectedByRole,
      newDiscountPct,
      targetStatus,
    },
  });

  // Notify the approver the SPA has been routed to
  const nextApproverRole = getAuthorizedApproverRole(targetStatus);
  if (nextApproverRole) {
    await notificationService.notifyApproverPending(newSpa, nextApproverRole);
  }

  return newSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. EXPIRE  (called by scheduler)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transitions a SPA to EXPIRED.
 *
 * Called by the scheduler when:
 *   - PENDING_CONFIRMATION: confirmation window elapsed without response
 *   - ACTIVE_CONTRACT / EXPIRING_SOON: valid_till date reached
 *
 * @param {string} spaId
 * @returns {object}  Updated SPA
 */
async function expire(spaId) {
  const spa = await _loadSpa(spaId);

  const expirableStatuses = new Set([
    STATUSES.PENDING_CONFIRMATION,
    STATUSES.ACTIVE_CONTRACT,
    STATUSES.EXPIRING_SOON,
  ]);

  if (!expirableStatuses.has(spa.status)) {
    throw new Error(
      `SPA "${spaId}" cannot be expired from status "${spa.status}".`
    );
  }

  const updatedSpa = await requestService.update(spaId, {
    status:    STATUSES.EXPIRED,
    updatedAt: new Date(),
  });

  await auditLogService.log({
    spaId,
    actor:     { id: 'SYSTEM', name: 'System', role: 'SYSTEM' },
    action:    'EXPIRE',
    oldStatus: spa.status,
    newStatus: STATUSES.EXPIRED,
    metadata:  { schedulerTriggered: true },
  });

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. TRIGGER EXPIRY ALERT  (called by scheduler)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by the scheduler at 30, 15, and 7 days before contract expiry.
 *
 *   30 days: transitions ACTIVE_CONTRACT → EXPIRING_SOON + sends renewal prompt
 *   15 days: sends urgent alert (SPA already EXPIRING_SOON)
 *    7 days: sends critical alert
 *
 * @param {string} spaId
 * @param {number} daysUntilExpiry  30 | 15 | 7
 * @returns {object}  Updated SPA
 */
async function triggerExpiryAlert(spaId, daysUntilExpiry) {
  const spa = await _loadSpa(spaId);
  let updatedSpa = spa;

  // Transition to EXPIRING_SOON on first alert (30 days)
  if (spa.status === STATUSES.ACTIVE_CONTRACT && daysUntilExpiry <= 30) {
    updatedSpa = await requestService.update(spaId, {
      status:    STATUSES.EXPIRING_SOON,
      updatedAt: new Date(),
    });

    await auditLogService.log({
      spaId,
      actor:     { id: 'SYSTEM', name: 'System', role: 'SYSTEM' },
      action:    'EXPIRY_ALERT',
      oldStatus: STATUSES.ACTIVE_CONTRACT,
      newStatus: STATUSES.EXPIRING_SOON,
      metadata:  { daysUntilExpiry },
    });
  }

  await notificationService.notifyExpiryAlert(updatedSpa, daysUntilExpiry);

  return updatedSpa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  submit,
  approve,
  reject,
  requestClarification,
  respondToClarification,
  withdraw,
  confirm,
  reraise,
  expire,
  triggerExpiryAlert,

  // Expose config so scheduler and tests can read thresholds
  CONFIG,
};
