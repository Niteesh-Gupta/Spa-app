-- ── 006_clean_test_data.sql ───────────────────────────────────────────────────
-- Removes price_requests rows created during development and E2E testing.
-- Safe to run against production before go-live — only targets known test
-- accounts and test request IDs. Real user requests are not affected.
--
-- REVIEW BEFORE RUNNING:
--   1. Confirm the request_numbers listed below are test-only.
--   2. Run the SELECT preview queries first to see what will be deleted.
--   3. Run in Supabase SQL Editor (Project → SQL Editor → New query).
--
-- ── Preview (run these first) ─────────────────────────────────────────────────

-- Preview A: requests from test user accounts
SELECT pr.request_number, pr.status, pr.created_at, u.email, u.name
FROM   price_requests pr
JOIN   users u ON u.id = pr.created_by
WHERE  u.email IN (
  'tm@spa.com',
  'rsm@spa.com',
  'zsm@spa.com',
  'nsm@spa.com',
  'cm@spa.com',
  'sc@spa.com',
  'test.tm@coloplast.com',
  'intm1@coloplast.com',
  'inrsm1@coloplast.com',
  'inzsm@coloplast.com',
  'innsm@coloplast.com'
);

-- Preview B: known E2E test requests by ID
-- (SPA-001 was created during developer end-to-end testing on 2026-04-12)
SELECT request_number, status, deal_stage, created_at
FROM   price_requests
WHERE  request_number IN ('SPA-001');

-- ── Delete ────────────────────────────────────────────────────────────────────

-- Delete requests from test user accounts
DELETE FROM price_requests
WHERE created_by IN (
  SELECT id FROM users
  WHERE email IN (
    'tm@spa.com',
    'rsm@spa.com',
    'zsm@spa.com',
    'nsm@spa.com',
    'cm@spa.com',
    'sc@spa.com',
    'test.tm@coloplast.com',
    'intm1@coloplast.com',
    'inrsm1@coloplast.com',
    'inzsm@coloplast.com',
    'innsm@coloplast.com'
  )
);

-- Delete known E2E test requests by ID
DELETE FROM price_requests
WHERE request_number IN ('SPA-001');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS remaining_requests FROM price_requests;
