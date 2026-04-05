'use strict';
/**
 * Deletes all price_requests rows where tm_name is NOT 'Amit Sharma'.
 * Usage: node scripts/purge_mock_requests.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // List rows to be deleted
  const { data: toDelete, error: listErr } = await supabase
    .from('price_requests')
    .select('id, tm_name, customer')
    .neq('tm_name', 'Amit Sharma');

  if (listErr) throw listErr;
  console.log(`Rows to delete (tm_name != 'Amit Sharma'): ${toDelete.length}`);
  toDelete.forEach(r => console.log(`  [to delete] ${r.id} | ${r.tm_name} | ${r.customer}`));

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
  } else {
    const { error: delErr } = await supabase
      .from('price_requests')
      .delete()
      .neq('tm_name', 'Amit Sharma');

    if (delErr) throw delErr;
    console.log(`\nDeleted: ${toDelete.length} rows`);
  }

  // Show remaining
  const { data: remaining, error: remErr } = await supabase
    .from('price_requests')
    .select('id, tm_name, customer')
    .order('created_at', { ascending: false });

  if (remErr) throw remErr;
  console.log(`\nRemaining rows (${remaining.length}):`);
  if (remaining.length === 0) {
    console.log('  (none)');
  } else {
    remaining.forEach(r => console.log(`  ${r.id} | ${r.tm_name} | ${r.customer}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
