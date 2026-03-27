'use strict';

const { createClient } = require('@supabase/supabase-js');

// ── Singleton Supabase client ──────────────────────────────────────────────────
//
// Uses the service_role key — this bypasses Row Level Security and is correct
// for server-side use. Never expose this key to the browser.
//
// Required env vars (see .env.example):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase credentials. ' +
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
  );
}

const db = createClient(url, key, {
  auth: {
    // Service role key does not use the auth session — disable auto-refresh
    autoRefreshToken:  false,
    persistSession:    false,
    detectSessionInUrl: false,
  },
});

module.exports = db;
