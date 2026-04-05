'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const USERS = [
  { email: 'intm1@coloplast.com',  role: 'TM',           name: 'Amit Sharma' },
  { email: 'inrsm1@coloplast.com', role: 'RSM',          name: 'Priya Mehta' },
  { email: 'inzsm@coloplast.com',  role: 'ZSM',          name: 'Renjith R' },
  { email: 'innsm@coloplast.com',  role: 'NSM',          name: 'Rajib Chakraborty' },
  { email: 'incm@coloplast.com',   role: 'CM',           name: 'Sourabha Nadipuram' },
  { email: 'insc@coloplast.com',   role: 'SC',           name: 'Supply Chain User' },
];

(async () => {
  console.log('Hashing passwords…');
  const hash = await bcrypt.hash('Password@123', 10);
  console.log(`Hash: ${hash}\n`);

  const rows = USERS.map(u => ({ ...u, password_hash: hash, is_active: true }));

  console.log('Upserting 6 users…');
  const { error: upsertError } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'email' });

  if (upsertError) {
    console.error('Upsert failed:', upsertError.message);
    process.exit(1);
  }
  console.log('Upsert succeeded.\n');

  console.log('Verifying — SELECT email, role FROM users WHERE email IN (…):');
  const emails = USERS.map(u => u.email);
  const { data, error: selectError } = await supabase
    .from('users')
    .select('email, role, name')
    .in('email', emails)
    .order('role');

  if (selectError) {
    console.error('Select failed:', selectError.message);
    process.exit(1);
  }

  console.log(`\nFound ${data.length} / 6 rows:`);
  data.forEach(u => console.log(`  ${u.role.padEnd(14)} ${u.email}  (${u.name})`));

  if (data.length !== 6) {
    console.error('\nWARNING: expected 6 rows but got', data.length);
    process.exit(1);
  }
  console.log('\nAll 6 users seeded successfully.');
})();
