'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

// NOTE: the live DB column is 'region' (not 'zone') — zone column does not exist.
// Using 'region' to store the broad zone value (South / All).
const UPDATES = [
  { email: 'intm1@coloplast.com',  region: 'South' },
  { email: 'inrsm1@coloplast.com', region: 'South' },
  { email: 'inzsm@coloplast.com',  region: 'South' },
  { email: 'innsm@coloplast.com',  region: 'All'   },
  { email: 'incm@coloplast.com',   region: 'All'   },
  { email: 'insc@coloplast.com',   region: 'All'   },
];

(async () => {
  for (const { email, region } of UPDATES) {
    const { error } = await supabase.from('users').update({ region }).eq('email', email);
    if (error) {
      console.error(`FAIL  ${email}: ${error.message}`);
    } else {
      console.log(`OK    ${email} → region = '${region}'`);
    }
  }

  // Verify
  console.log('\nVerifying…');
  const emails = UPDATES.map(u => u.email);
  const { data, error } = await supabase
    .from('users')
    .select('email, region')
    .in('email', emails)
    .order('email');

  if (error) { console.error('Select failed:', error.message); process.exit(1); }
  data.forEach(u => console.log(`  ${u.email.padEnd(28)} region = ${u.region}`));
})();
