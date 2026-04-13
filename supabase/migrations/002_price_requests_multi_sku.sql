-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Add multi-SKU fields to price_requests
-- Run in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE price_requests
  ADD COLUMN IF NOT EXISTS date            TEXT,
  ADD COLUMN IF NOT EXISTS tm_name         TEXT,
  ADD COLUMN IF NOT EXISTS dealer_name     TEXT,
  ADD COLUMN IF NOT EXISTS dealer_id       UUID REFERENCES dealers(id),
  ADD COLUMN IF NOT EXISTS skus            JSONB,
  ADD COLUMN IF NOT EXISTS dealer_margin   NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS realisation     NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS expected_revenue NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS deal_stage      TEXT,
  ADD COLUMN IF NOT EXISTS linked_to       TEXT,
  ADD COLUMN IF NOT EXISTS extra_info      JSONB,
  ADD COLUMN IF NOT EXISTS npd             INTEGER;

-- Ensure request_number is unique (human-readable SPA-xxx ID)
ALTER TABLE price_requests
  ADD CONSTRAINT IF NOT EXISTS price_requests_request_number_unique UNIQUE (request_number);

CREATE INDEX IF NOT EXISTS idx_price_requests_request_number ON price_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_price_requests_status         ON price_requests(status);
CREATE INDEX IF NOT EXISTS idx_price_requests_tm_name        ON price_requests(tm_name);
CREATE INDEX IF NOT EXISTS idx_price_requests_linked_to      ON price_requests(linked_to);
