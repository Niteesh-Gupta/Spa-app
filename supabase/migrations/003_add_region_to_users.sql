-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Add region column to users table
-- zone already exists in initial schema; region is new.
-- Both are used for hierarchy-based request visibility.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS region TEXT;

-- zone column already defined in 001_initial_schema.sql but guard anyway
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'zone'
  ) THEN
    ALTER TABLE users ADD COLUMN zone TEXT;
  END IF;
END$$;

COMMENT ON COLUMN users.zone   IS 'Sales zone — North | South | East | West. Set for ZSM / RSM / TM.';
COMMENT ON COLUMN users.region IS 'Sales region within the zone. Set for RSM and TM only — must match exactly for hierarchy visibility.';
