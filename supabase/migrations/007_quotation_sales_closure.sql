-- Migration 007: Quotation → Sales Confirmation → Closure lifecycle
-- Safe to re-run: all ADD COLUMN IF NOT EXISTS

-- Quotation columns
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quotation_number        TEXT;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quotation_date          DATE;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS validity_start_date     DATE;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS validity_end_date       DATE;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quotation_remarks       TEXT;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quotation_generated_at  TIMESTAMPTZ;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quotation_generated_by  UUID REFERENCES users(id);

-- Sales confirmation columns
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS sales_done              TEXT;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS invoice_number          TEXT;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS invoice_date            DATE;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS quantity_sold           NUMERIC;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS confirmed_value         NUMERIC;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS sales_remarks           TEXT;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS sales_confirmed_at      TIMESTAMPTZ;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS sales_confirmed_by      UUID REFERENCES users(id);

-- Closure columns
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS closed_at               TIMESTAMPTZ;
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS closed_by               UUID REFERENCES users(id);
