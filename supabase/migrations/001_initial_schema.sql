-- ─────────────────────────────────────────────────────────────────────────────
-- SPA System v2 — Initial Schema
-- Run this once in the Supabase SQL editor to set up all 14 tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. users ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL
                            CHECK (role IN (
                              'TM','RSM','ZSM','NSM','CM',
                              'TENDER_MANAGER','SUPPLY_CHAIN','FINANCE','ADMIN'
                            )),
  zone          TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. spa_requests ───────────────────────────────────────────────────────────
-- id is the SDR reference number (SDR-YYYY-MM-NNNNN), not a UUID.
CREATE TABLE spa_requests (
  id                                  TEXT        PRIMARY KEY,
  status                              TEXT        NOT NULL,
  discount_pct                        NUMERIC(8,4)  NOT NULL,

  raised_by_role                      TEXT        NOT NULL,
  raised_by_id                        TEXT        NOT NULL,
  raised_by_name                      TEXT        NOT NULL,

  dealer_name                         TEXT        NOT NULL,
  account_name                        TEXT        NOT NULL,
  customer_details                    JSONB       NOT NULL DEFAULT '{}',
  product_details                     JSONB       NOT NULL,
  quantity                            INTEGER     NOT NULL,
  price_to_be_quoted                  NUMERIC(12,4) NOT NULL,
  standard_price                      NUMERIC(12,4) NOT NULL,
  volume                              NUMERIC(12,4) NOT NULL,
  expected_business                   NUMERIC(12,4),
  business_justification              TEXT        NOT NULL,
  other_details                       TEXT,

  rejected_by_role                    TEXT,
  rejection_reason                    TEXT,
  rejection_target_role               TEXT,

  clarification_by_role               TEXT,
  clarification_question              TEXT,
  clarification_response              TEXT,

  supply_chain_notification_required  BOOLEAN     NOT NULL DEFAULT FALSE,

  contract_start_date                 DATE,
  contract_end_date                   DATE,
  confirmed_at                        TIMESTAMPTZ,
  confirmation_deadline               TIMESTAMPTZ,
  approved_at                         TIMESTAMPTZ,

  -- Self-referential: re-raised SPA links back to the original
  linked_to                           TEXT        REFERENCES spa_requests(id),

  submitted_at                        TIMESTAMPTZ NOT NULL,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spa_requests_status       ON spa_requests(status);
CREATE INDEX idx_spa_requests_account_name ON spa_requests(account_name);
CREATE INDEX idx_spa_requests_raised_by_id ON spa_requests(raised_by_id);
CREATE INDEX idx_spa_requests_linked_to    ON spa_requests(linked_to);

-- ── 3. approval_records ───────────────────────────────────────────────────────
CREATE TABLE approval_records (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id     TEXT        NOT NULL REFERENCES spa_requests(id),
  actor_id   TEXT        NOT NULL,
  actor_role TEXT        NOT NULL,
  actor_name TEXT        NOT NULL,
  action     TEXT        NOT NULL
             CHECK (action IN ('APPROVE','REJECT','CLARIFY','RESPOND','WITHDRAW')),
  result     JSONB       NOT NULL DEFAULT '{}',
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_records_spa_id ON approval_records(spa_id);

-- ── 4. audit_log ──────────────────────────────────────────────────────────────
-- Immutable — no updates or deletes. actor_id is TEXT because 'SYSTEM' is valid.
CREATE TABLE audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id     TEXT        NOT NULL REFERENCES spa_requests(id),
  actor_id   TEXT        NOT NULL,
  actor_name TEXT        NOT NULL,
  actor_role TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  old_status TEXT,
  new_status TEXT        NOT NULL,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_spa_id ON audit_log(spa_id);

-- ── 5. notifications ──────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id         TEXT        REFERENCES spa_requests(id),
  event          TEXT        NOT NULL,
  recipient_role TEXT,
  recipient_id   TEXT,
  payload        JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'QUEUED'
                             CHECK (status IN ('QUEUED','SENT','FAILED')),
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_spa_id ON notifications(spa_id);
CREATE INDEX idx_notifications_status ON notifications(status);

-- ── 6. products ───────────────────────────────────────────────────────────────
CREATE TABLE products (
  id             TEXT        PRIMARY KEY,  -- SKU
  name           TEXT        NOT NULL,
  category       TEXT,
  standard_price NUMERIC(12,4) NOT NULL,
  unit           TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. dealers ────────────────────────────────────────────────────────────────
CREATE TABLE dealers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  contact_name  TEXT,
  contact_email TEXT,
  region        TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. accounts ───────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  type       TEXT        CHECK (type IN ('HOSPITAL','INSTITUTION','CLINIC','OTHER')),
  city       TEXT,
  state      TEXT,
  region     TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. customers ──────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id),
  name        TEXT        NOT NULL,
  designation TEXT,
  email       TEXT,
  phone       TEXT,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_account_id ON customers(account_id);

-- ── 10. contracts ─────────────────────────────────────────────────────────────
CREATE TABLE contracts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id                 TEXT        NOT NULL UNIQUE REFERENCES spa_requests(id),
  account_name           TEXT        NOT NULL,
  product_details        JSONB       NOT NULL,
  approved_price         NUMERIC(12,4) NOT NULL,
  standard_price         NUMERIC(12,4) NOT NULL,
  discount_pct           NUMERIC(8,4)  NOT NULL,
  start_date             DATE        NOT NULL,
  end_date               DATE        NOT NULL,
  -- Snapshot of the full approval chain at the time of contract freeze
  approval_chain_summary JSONB       NOT NULL DEFAULT '[]',
  confirmed_at           TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 11. contract_files ────────────────────────────────────────────────────────
CREATE TABLE contract_files (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID        NOT NULL REFERENCES contracts(id),
  spa_id       TEXT        NOT NULL,
  file_type    TEXT        NOT NULL DEFAULT 'CONTRACT_PDF',
  file_name    TEXT        NOT NULL,
  file_path    TEXT        NOT NULL,  -- local path or future S3 key
  file_size    INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_files_contract_id ON contract_files(contract_id);

-- ── 12. clarification_threads ─────────────────────────────────────────────────
CREATE TABLE clarification_threads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id         TEXT        NOT NULL REFERENCES spa_requests(id),
  asked_by_role  TEXT        NOT NULL,
  asked_by_id    TEXT        NOT NULL,
  question       TEXT        NOT NULL,
  answered_by_id TEXT,
  answer         TEXT,
  asked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at    TIMESTAMPTZ
);

CREATE INDEX idx_clarification_threads_spa_id ON clarification_threads(spa_id);

-- ── 13. sla_records ───────────────────────────────────────────────────────────
CREATE TABLE sla_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spa_id         TEXT        NOT NULL REFERENCES spa_requests(id),
  approval_level TEXT        NOT NULL
                             CHECK (approval_level IN ('RSM','ZSM','NSM','CM')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  action_taken   TEXT,
  sla_hours      INTEGER     NOT NULL DEFAULT 48,
  breached       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sla_records_spa_id ON sla_records(spa_id);

-- ── 14. refresh_tokens ────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- The backend uses the service_role key which bypasses RLS.
-- RLS is enabled here as a safety net; add policies when direct client
-- access (e.g., Supabase Auth + anon key) is introduced.

ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens        ENABLE ROW LEVEL SECURITY;
