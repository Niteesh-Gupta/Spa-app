'use strict';
/**
 * v4 Migration Runner
 * Usage:
 *   DATABASE_URL=postgresql://postgres:[password]@db.bndtmiwhrhflsctvgcwi.supabase.co:5432/postgres node scripts/run_v4_migration.js
 *
 * Get DATABASE_URL from: Supabase dashboard → Settings → Database → Connection string (URI)
 * Or add DATABASE_URL to your .env file.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_PATH = path.join(__dirname, '..', '..', '..', 'Niteesh-Notes', 'v4_migration.sql');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set.');
    console.error('Get it from: Supabase dashboard → Settings → Database → Connection string (URI)');
    console.error('Then either:');
    console.error('  • Add to .env:  DATABASE_URL=postgresql://postgres:[password]@db.bndtmiwhrhflsctvgcwi.supabase.co:5432/postgres');
    console.error('  • Or prefix the command: DATABASE_URL=... node scripts/run_v4_migration.js');
    process.exit(1);
  }

  let sql;
  try {
    sql = fs.readFileSync(SQL_PATH, 'utf8');
  } catch (err) {
    console.error('ERROR: Could not read migration file:', SQL_PATH);
    console.error(err.message);
    process.exit(1);
  }

  console.log(`Read migration file (${sql.length} chars).`);

  // Parse the URL manually to avoid pg misinterpreting usernames with dots (pooler format)
  const parsed = new URL(url);
  const client = new Client({
    host:     parsed.hostname,
    port:     parseInt(parsed.port) || 5432,
    user:     decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl:      { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    console.log('Connected to Supabase database.');

    console.log('Running v4 migration…');
    await client.query(sql);
    console.log('✓ v4 migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
