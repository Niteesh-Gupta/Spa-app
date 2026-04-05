'use strict';
/**
 * Runs migrations 003 and 004:
 *   003 — adds region column to users table
 *   004 — seeds the complete Coloplast India hierarchy (34 users)
 *
 * Usage:
 *   node scripts/seed_users.js
 *
 * Requires DATABASE_URL in .env (Supabase → Settings → Database → URI mode).
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS = [
  '003_add_region_to_users.sql',
  '004_seed_users.sql',
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set in .env');
    console.error('Get it from: Supabase dashboard → Settings → Database → URI mode');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase.');

  for (const file of MIGRATIONS) {
    const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', file);
    const sql     = fs.readFileSync(sqlPath, 'utf8');
    console.log(`\nRunning ${file}…`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file} complete`);
    } catch (err) {
      console.error(`  ✗ ${file} failed: ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('\nAll migrations complete. 34 users seeded.');
  console.log('Password for all accounts: Password@123');
})();
