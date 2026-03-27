# CLAUDE.md — SPA System v2 (Coloplast India)

> Read this file at the start of every session. Confirm understanding before writing any code.
> v1 is frozen. All work is in this v2 codebase only.
> When anything is ambiguous — especially approval logic — ASK before assuming.

---

## Why This System Exists

The current SPA (Special Price Approval) process runs entirely on email across the chain TM → RSM → ZSM → NSM → CM. This causes:

- No single source of truth — approvals exist only in email threads
- Stale approvals being used — sales presents an old approval that has since been rejected or superseded; Supply Chain has no way to verify validity
- No traceability — Supply Chain saves their own email copies but cannot confirm if terms have changed
- Multiple live SPAs for the same account/product with no linkage or audit
- One-directional information flow — Supply Chain approves and then loses visibility

**v2 solves this by making the system the single authoritative record.** Every approval, rejection, revision, and contract is logged here. Supply Chain cross-checks against live system records — not email copies.

---

## What Already Exists in This Codebase — DO NOT REBUILD

The following is already built and working. Read and reuse — do not rewrite from scratch:

| Component | Location | Status |
|---|---|---|
| Workflow state machine | `src/workflows/workflowEngine.js` | ✅ Built |
| Workflow orchestrator | `src/workflows/sdrWorkflow.js` | ✅ Built — exposes submit, approve, reject, clarification, resubmit, activate, expire, triggerExpiryAlert |
| Approval engine | `src/approval-engine/approvalEngine.js` | ✅ Built |
| Approval matrix (configurable, cached) | `src/approval-engine/approvalMatrix.js` | ✅ Built |
| SLA tracker | `src/approval-engine/slaTracker.js` | ✅ Built |
| Request service | `src/services/requestService.js` | ✅ Built |
| Approval service | `src/services/approvalService.js` | ✅ Built |
| Audit log service (immutable) | `src/services/auditLogService.js` | ✅ Built |
| Notification service (stub) | `src/services/notificationService.js` | ✅ Built — all notification events stubbed, needs real SMTP wired |
| Auth service + JWT middleware | `src/services/authService.js`, `src/middleware/auth.js` | ✅ Built |
| File storage service | `src/services/fileStorageService.js` | ✅ Built — local storage default, S3 SDK missing from package.json |
| Master data service | `src/services/masterDataService.js` | ✅ Built |
| Exception engine | `src/exception-engine/` | ✅ Built |
| Scheduler (expiry/SLA jobs) | `src/scheduler.js` | ✅ Built |
| All DB models | `src/models/` | ✅ Built — 14 tables |
| API routes + controllers | `src/api/`, `src/controllers/` | ✅ Built |
| AI Assist layer | `src/ai-assist/` | ✅ Built as stub — no logic implemented |
| HTML prototype | `prototype/Coloplast_SDR_Portal_v3.html` | ✅ Reference UI only |

**Before writing any new code, check if the relevant service or module already exists.**

---

## What Needs to Change — The Core Problem

The existing approval chain is:

```
SUBMITTED → L2 (ZSM) → L3 (NSM) → L4 (Supply Chain) → L5 (CM) → APPROVED
```

**This is wrong for Coloplast India.** Supply Chain is NOT an approver. The correct chain routes by discount threshold, and Supply Chain only receives a notification post-approval for credit note purposes.

---

## Roles

| Role | Code Name | Raises SPA? | Approves? | Notes |
|---|---|---|---|---|
| Territory Manager | `TM` | ✅ Yes | ❌ No | Primary raiser |
| RSM | `RSM` | ✅ Yes | ✅ Yes (L1) | Also raises, also first approver |
| Tender Manager | `TENDER_MANAGER` | ✅ Yes | ❌ No | Same flow as TM |
| ZSM | `ZSM` | ❌ No | ✅ Yes (L2) | |
| NSM | `NSM` | ❌ No | ✅ Yes (L3) | |
| Country Manager | `CM` | ❌ No | ✅ Yes (L4 — final) | Only for discount > 35% |
| Supply Chain | `SUPPLY_CHAIN` | ❌ No | ❌ No | Visibility only — see below |
| Finance | `FINANCE` | ❌ No | ❌ No | Read-only reporting |
| Admin | `ADMIN` | ❌ No | ❌ No | System administration |

### Supply Chain — Critical Clarification

**Supply Chain is NOT part of the approval chain. They do not approve or reject SPAs.**

Their role:
- Automatically notified when any deal with discount > 35% reaches `ACTIVE_CONTRACT`
- Can view final approved price, product details, account name, validity dates only
- Use the system to verify credit note requests from sales — SPA reference number must match an `ACTIVE_CONTRACT`
- If reference number is not `ACTIVE_CONTRACT` → not valid for credit note processing

The existing codebase has Supply Chain as L4 approver (`UNDER_REVIEW_L4`). **This must be removed from the approval chain and replaced with the notification-only role above.**

---

## SPA Reference Number

Every SPA gets a unique reference number on submission (format already exists: `SDR-YYYY-MM-NNNNN`).

- Travels with the SPA through its entire lifecycle
- Printed on both PDFs
- Supply Chain uses it to verify validity
- Sales cannot present a superseded, rejected, or expired SPA for credit note processing

---

## Complete Workflow

```
1. REQUEST RAISED     → TM / RSM / Tender Manager submits SPA
2. APPROVAL CHAIN     → Routes by discount threshold (see matrix below)
3. APPROVED           → Final approver signs off
4. CONFIRMATION       → TM/RSM confirm hospital accepted the deal (5–10 day window)
5. CONTRACT FREEZE    → SPA locked, master record created with validity dates
6. PDF GENERATED      → Final contract PDF generated and distributed
7. SUPPLY CHAIN NOTIFIED → For deals > 35%, Supply Chain receives notification
```

---

## Stage 1 — SPA Request Fields

| Field | Description |
|---|---|
| Dealer Name | Dealer through whom the quote is routed |
| Account Name | End customer / hospital / institution |
| Customer Details | Contact and location details |
| Product Details | Products being quoted |
| Quantity | Units being quoted |
| Price to be Quoted | Proposed special price |
| Volume | Expected order volume |
| Expected Business | Business value / revenue expectation |
| Business Justification | Why this SPA is needed |
| Other Relevant Details | Any additional context |

**Stale approval rule:** When a new SPA is submitted for the same Account + Product combination, any prior SPA for that combination that is not already `ACTIVE_CONTRACT` or `EXPIRED` is automatically marked `SUPERSEDED`. This prevents multiple live approvals for the same deal.

---

## Stage 2 — Approval Chain & Discount Thresholds

### Total Discount Definition
> Total discount = dealer's margin + discount arising from a lower rate from the distributor (DO).
> This is the combined effective discount on dealer price (DP) — not just one component.

### Approval Routing

| Discount on DP | Approval Chain |
|---|---|
| ≤ 15% | TM → RSM (RSM approves — done) |
| > 15% and ≤ 25% | TM → RSM → ZSM (ZSM approves — done) |
| > 25% and ≤ 35% | TM → RSM → ZSM → NSM (NSM approves — done) |
| > 35% | TM → RSM → ZSM → NSM → CM (CM approves — done) |

No level skipping. Each approver reviews before moving to the next.

**After CM approves a > 35% deal** → Supply Chain is automatically notified (notification, not approval).

### What changes vs existing code:
- Remove `UNDER_REVIEW_L4` (Supply Chain approval level) from the state machine
- Remove `UNDER_REVIEW_L5` — CM becomes L4 (final)
- Reconfigure `approvalMatrix.js` thresholds to match the table above
- Add Supply Chain notification trigger in `notificationService.js` post-CM approval on > 35% deals

---

## Stage 2a — Clarification vs Rejection — Two Distinct Actions

These are separate actions with different purposes and different routing. Do not conflate them.

---

### Action 1: Clarification

**Purpose:** An approver needs more information before making a decision. They are NOT rejecting — they are pausing the approval to seek additional info.

**Who can use it:** Any approver at any level (RSM, ZSM, NSM, CM).

**Flow:**
- Approver raises a clarification with a mandatory question or checklist
- SPA status moves to `CLARIFICATION_REQUIRED` (tagged with the level, e.g. `CLARIFICATION_REQUIRED_L2`)
- Goes back to TM/RSM (the raiser) — not down one approver level
- TM/RSM answers the question and/or provides additional information
- SPA goes back to **the same approver who asked** — not restarted from the beginning
- Same approver then makes their decision (approve, reject, or ask again)

**Key rule:** Clarification does not change the approval level or routing. It is a pause-and-resume at the same point in the chain.

**What exists in the codebase:** `requestClarification` in `sdrWorkflow.js` and `CLARIFICATION_REQUIRED_L2/L3` statuses already exist. Keep this structure. Extend to cover all levels (L1 through L4).

---

### Action 2: Rejection

**Purpose:** An approver is declining the SPA. They have made a decision — no.

**Who can use it:** Any approver at any level.

**Flow — back one level, not terminal:**

| Rejector | SPA goes back to |
|---|---|
| CM | NSM |
| NSM | ZSM |
| ZSM | RSM |
| RSM | TM |

- Rejection includes a mandatory reason
- The receiving party (one level down) must answer the reason and/or modify the SPA terms before re-raising upward
- TM/RSM can also choose to accept the rejection and not re-raise — in that case the SPA is marked `WITHDRAWN`

### Re-raise Routing After Rejection (Critical Rule)
- **Discount unchanged or lower than when the rejector last saw it** → SPA goes directly back to that rejector. Intermediate levels do not re-approve.
- **Discount changed into a different threshold band** → SPA restarts the chain from the correct level for the new discount value.

### Fresh Re-raise by TM / RSM
TM and RSM can independently raise a fresh SPA at any time. Fresh raise = full chain restart. Prior SPA for same Account + Product automatically marked `SUPERSEDED`.

### What changes vs existing code:
The existing codebase treats rejection as terminal (status → `REJECTED`, closed). This needs to change to a **back-one-level re-raise flow** as described above. The existing `reject` action in `sdrWorkflow.js` needs to route back rather than terminate, except when TM/RSM chooses not to re-raise (then → `WITHDRAWN`).

---

## Stage 3 — Confirmation Window

After final approval, TM/RSM confirm that the hospital has accepted the deal.

- Confirmation window: **5–10 days** from final approval (user-configurable within this range)
- TM or RSM enters the **contract start date** at confirmation
- If no confirmation within the window → status moves to `EXPIRED`

**Hospital rejection scenario:** If hospital rejects the deal, TM/RSM can re-raise with revised terms (lower price or higher dealer margin). This creates a fresh SPA and restarts the approval chain. The original SPA is marked `SUPERSEDED`.

**Future:** When legacy data is available, confirmation records should link to historical contracts. Flag as future integration point — do not build now.

---

## Stage 4 — Contract Freeze & Master Record

Once confirmed:
- SPA is locked — no further edits
- Master record created with: SPA reference number, approved pricing, product details, validity start date (entered by TM/RSM), validity end date, linked account and dealer details, full approval chain summary
- Records are never deleted — append only

---

## Stage 5 — PDF Generation

### PDF 1 — Not applicable in v2
The negotiation PDF from earlier discussion is removed — approval comes before hospital negotiation in the correct flow. Only one PDF is generated.

### PDF 2 — Final Approved Contract
- Generated after confirmation is complete and validity dates are entered
- Contains: SPA reference number, approved pricing, product details, validity start/end dates, account and dealer details, all approved terms, approval chain summary
- Shared with: hospital / end customer + all internal stakeholders per authorization level
- This is the official contract document and the authoritative record for Supply Chain credit note processing

The existing PDF generation trigger in `sdrWorkflow.js` fires on CM approval. **Adjust to fire on confirmation + date entry instead.**

---

## Expiry Alerts

The existing `scheduler.js` and `triggerExpiryAlert` in `sdrWorkflow.js` already handle expiry alerts. Configure:
- Alert at **30 days** before expiry (renewal prompt)
- Alert at **15 days** before expiry (urgent)
- Alert at **7 days** before expiry (critical)
- Auto-transition to `EXPIRED` on `valid_till` date

These triggers already exist — just confirm thresholds are set correctly.

---

## Full SPA Status Lifecycle

| Status | Meaning |
|---|---|
| `DRAFT` | Created, not yet submitted |
| `SUBMITTED` | Submitted — auto-routes to first approver |
| `PENDING_RSM` | Awaiting RSM approval (≤ 15% discount) |
| `PENDING_ZSM` | Awaiting ZSM approval |
| `PENDING_NSM` | Awaiting NSM approval |
| `PENDING_CM` | Awaiting CM approval (> 35% discount) |
| `APPROVED` | Final approval received |
| `PENDING_CONFIRMATION` | Awaiting TM/RSM hospital confirmation (5–10 day window) |
| `CONFIRMED` | Hospital accepted, start date entered |
| `ACTIVE_CONTRACT` | Frozen in master, contract live |
| `EXPIRING_SOON` | Within 30 days of expiry |
| `EXPIRED` | Validity period ended |
| `REJECTED` | Rejected — pending re-raise by prior level (not terminal except at TM level) |
| `SUPERSEDED` | Replaced by a newer SPA for same account + product |
| `WITHDRAWN` | Cancelled by raiser |
| `CLOSED` | Archived — fully terminal |

Remove from state machine: `UNDER_REVIEW_L2`, `UNDER_REVIEW_L3`, `UNDER_REVIEW_L4`, `UNDER_REVIEW_L5`, `CLARIFICATION_REQUIRED_L2/L3`, `RESUBMITTED`, `RENEWAL_IN_PROGRESS`, `ON_HOLD_FOR_DISCUSSION` — replace with the statuses above.

---

## Audit Trail — Keep As-Is

`auditLogService.js` is already built correctly — immutable, logs every action with timestamp, actor, role, old/new values. Do not change this. Ensure every new workflow action calls it.

---

## Notifications — Keep Structure, Update Triggers

`notificationService.js` is already structured correctly — all events are stubbed. Keep the structure. Add:
- `notifySupplyChain` — triggered post-CM approval on > 35% deals
- `notifyConfirmationRequired` — triggered post-approval to TM/RSM
- `notifyContractFrozen` — triggered on confirmation complete
- `notifyHospitalRejection` — triggered if TM/RSM marks hospital as rejected (prompts re-raise)

Real SMTP / n8n webhook to be wired later — stubs are fine for now.

---

## AI Advisor Module

- Already exists in `src/ai-assist/` as a stub
- No logic implemented
- Do not add any behaviour without explicit developer instruction

---

## Open Decisions (From Existing Docs — Do Not Resolve Without Developer)

- Hosting environment (AWS vs Azure) — unresolved
- Authentication method (JWT local vs Azure AD SSO) — unresolved
- Email provider (SMTP stub currently) — unresolved
- File storage (local vs S3 vs Azure Blob) — S3 SDK missing from package.json
- CI/CD pipeline — none exists yet

Do not make decisions on any of the above. Flag and ask.

---

## What Claude Code Must NOT Do

- Do not touch or reference v1
- Do not place Supply Chain in the approval chain — notification only
- Do not generate the final contract PDF before confirmation + validity dates are entered
- Do not treat rejection as terminal at approver levels — it goes back one level
- Do not rebuild services that already exist — read and reuse
- Do not implement AI Advisor logic without explicit instruction
- Do not delete any SPA records — append only
- Do not allow multiple non-superseded active SPAs for the same account + product
- Do not resolve open infrastructure decisions independently

---

## Session Workflow

1. Read this file and confirm understanding before writing any code
2. Check if relevant service/module already exists before building anything new
3. State your plan and wait for developer confirmation before making changes
4. Work in small reviewable chunks — no sweeping rewrites
5. Summarise what changed and what is next after each chunk
6. When in doubt on any logic — ask
