-- ── Migration 005 — Deal confirmation columns ─────────────────────────────────
-- Adds validity_expires_at and approved_at to price_requests.
-- Run once in the Supabase SQL editor.
--
--   validity_expires_at : confirmed_at + validity_days days  (set on confirmation)
--   approved_at         : timestamp when status was set to 'approved' (set on approval)

ALTER TABLE price_requests
  ADD COLUMN IF NOT EXISTS validity_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ;
