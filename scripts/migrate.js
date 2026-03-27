'use strict';
/**
 * One-time migration: add multi-SKU columns to price_requests.
 * Usage:
 *   DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres node scripts/migrate.js
 *
 * Get DATABASE_URL from: Supabase dashboard → Settings → Database → Connection string (URI)
 */
require('dotenv').config();
const { Client } = require('pg');

const sql = `
ALTER TABLE price_requests
  ADD COLUMN IF NOT EXISTS date              TEXT,
  ADD COLUMN IF NOT EXISTS tm_name           TEXT,
  ADD COLUMN IF NOT EXISTS dealer_name       TEXT,
  ADD COLUMN IF NOT EXISTS skus              JSONB,
  ADD COLUMN IF NOT EXISTS dealer_margin     NUMERIC,
  ADD COLUMN IF NOT EXISTS realisation       NUMERIC,
  ADD COLUMN IF NOT EXISTS expected_revenue  NUMERIC,
  ADD COLUMN IF NOT EXISTS deal_stage        TEXT,
  ADD COLUMN IF NOT EXISTS linked_to         TEXT,
  ADD COLUMN IF NOT EXISTS extra_info        JSONB,
  ADD COLUMN IF NOT EXISTS npd               INTEGER;
`;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set.');
    console.error('Get it from: Supabase dashboard → Settings → Database → Connection string (URI)');
    console.error('Add to .env:  DATABASE_URL=postgresql://postgres:[password]@db.bndtmiwhrhflsctvgcwi.supabase.co:5432/postgres');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('Connected to database.');
    await client.query(sql);
    console.log('Migration complete — all columns added to price_requests.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
