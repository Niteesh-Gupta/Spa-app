'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KEEP = ['SPA-022', 'SPA-023', 'SPA-024', 'SPA-025'];

async function main() {
  // ── 1. List rows that will be deleted ──────────────────────────────────────
  const { data: toDelete, error: listErr } = await supabase
    .from('price_requests')
    .select('request_number, status')
    .not('request_number', 'in', `(${KEEP.join(',')})`);

  if (listErr) throw listErr;
  console.log(`\nRows to delete (request_number NOT IN KEEP): ${toDelete.length}`);
  toDelete.forEach(r => console.log(`  [del] ${r.request_number} | ${r.status}`));

  // ── 2. Delete them ─────────────────────────────────────────────────────────
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('price_requests')
      .delete()
      .not('request_number', 'in', `(${KEEP.join(',')})`);
    if (delErr) throw delErr;
    console.log(`Deleted: ${toDelete.length} rows`);
  } else {
    console.log('Nothing to delete.');
  }

  // ── 3. Reset statuses for demo ────────────────────────────────────────────
  const resets = [
    { request_number: 'SPA-022', status: 'Approved' },
    { request_number: 'SPA-023', status: 'Pending RSM' },
    { request_number: 'SPA-024', status: 'Pending ZSM' },
    { request_number: 'SPA-025', status: 'Pending NSM' },
  ];

  console.log('\nResetting statuses...');
  for (const { request_number, status } of resets) {
    const { data, error } = await supabase
      .from('price_requests')
      .update({ status })
      .eq('request_number', request_number)
      .select('request_number, status');
    if (error) {
      console.log(`  [ERR]  ${request_number}: ${error.message}`);
    } else if (!data || data.length === 0) {
      console.log(`  [MISS] ${request_number} — row not found in DB`);
    } else {
      console.log(`  [ok]   ${request_number} → ${data[0].status}`);
    }
  }

  // ── 4. Final state ────────────────────────────────────────────────────────
  const { data: final, error: finalErr } = await supabase
    .from('price_requests')
    .select('request_number, status')
    .order('request_number');
  if (finalErr) throw finalErr;

  console.log(`\nFinal state (${final.length} rows):`);
  if (final.length === 0) {
    console.log('  (table is empty)');
  } else {
    final.forEach(r => console.log(`  ${r.request_number} | ${r.status}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
