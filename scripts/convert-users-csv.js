'use strict';

/**
 * convert-users-csv.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads  scripts/users.csv  and writes  scripts/users-import.json
 * ready for POST /api/admin/import-users.
 *
 * EXPECTED CSV FORMAT
 * ───────────────────
 * • First row must be the header (column names, case-insensitive):
 *       name, email, role, zone, manager_email
 *
 * • Columns:
 *     name          – Full name of the user (required)
 *     email         – Login email (required, will be lower-cased)
 *     role          – One of: TM | RSM | ZSM | NSM | CM | SC  (required)
 *     zone          – One of: North | South | East | West      (required)
 *     manager_email – Email of the user's direct manager       (optional, leave blank if none)
 *
 * • Fields may optionally be wrapped in double-quotes.
 *   Commas inside a quoted field are preserved.
 *   Example: "Kumar, Ravi",ravi@coloplast.com,TM,North,rsm@coloplast.com
 *
 * • Blank rows and rows where all fields are empty are silently skipped.
 *
 * EXAMPLE CSV
 * ───────────
 *   name,email,role,zone,manager_email
 *   Ravi Kumar,ravi@coloplast.com,TM,North,rsm.north@coloplast.com
 *   Priya Singh,priya@coloplast.com,RSM,North,zsm.north@coloplast.com
 *   Amit Verma,amit@coloplast.com,ZSM,North,nsm@coloplast.com
 *   Sunita Rao,sunita@coloplast.com,NSM,South,
 *
 * USAGE
 * ─────
 *   node scripts/convert-users-csv.js
 *   node scripts/convert-users-csv.js path/to/input.csv path/to/output.json
 *
 * OUTPUT
 * ──────
 *   scripts/users-import.json  — JSON array ready to POST as the request body
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const VALID_ROLES = ['TM', 'RSM', 'ZSM', 'NSM', 'CM', 'SC'];
const VALID_ZONES = ['North', 'South', 'East', 'West'];

// ── Args / paths ──────────────────────────────────────────────────────────────
const inputPath  = process.argv[2] || path.join(__dirname, 'users.csv');
const outputPath = process.argv[3] || path.join(__dirname, 'users-import.json');

// ── Minimal CSV parser (no dependencies) ─────────────────────────────────────
// Handles quoted fields (including quoted commas). Trims whitespace from
// unquoted fields; preserves whitespace inside quoted fields.
function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = [];
    let i = 0;

    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field — scan for closing quote (doubled quotes = escaped quote)
        i++; // skip opening quote
        let value = '';
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            value += line[i++];
          }
        }
        fields.push(value);
        if (line[i] === ',') i++; // skip delimiter
      } else {
        // Unquoted field — read until comma or end of line
        const end = line.indexOf(',', i);
        if (end === -1) {
          fields.push(line.slice(i).trim());
          break;
        } else {
          fields.push(line.slice(i, end).trim());
          i = end + 1;
        }
      }
    }

    rows.push(fields);
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (!fs.existsSync(inputPath)) {
  console.error(`ERROR: Input file not found: ${inputPath}`);
  console.error('Create scripts/users.csv or pass a path as the first argument.');
  process.exit(1);
}

const raw  = fs.readFileSync(inputPath, 'utf8');
const rows = parseCSV(raw);

if (rows.length < 2) {
  console.error('ERROR: CSV has no data rows (only a header or is empty).');
  process.exit(1);
}

// ── Map header → column indices ───────────────────────────────────────────────
const header = rows[0].map(h => h.toLowerCase().trim());
const col = {
  name:          header.indexOf('name'),
  email:         header.indexOf('email'),
  role:          header.indexOf('role'),
  zone:          header.indexOf('zone'),
  manager_email: header.indexOf('manager_email'),
};

const missing = Object.entries(col)
  .filter(([k, v]) => v === -1 && k !== 'manager_email')
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`ERROR: Required column(s) missing from CSV header: ${missing.join(', ')}`);
  console.error(`Found headers: ${rows[0].join(', ')}`);
  process.exit(1);
}

// ── Convert rows ──────────────────────────────────────────────────────────────
const users  = [];
const errors = [];

for (let i = 1; i < rows.length; i++) {
  const row    = rows[i];
  const lineNo = i + 1; // 1-based, accounting for header

  const name          = row[col.name]  || '';
  const email         = (row[col.email] || '').toLowerCase().trim();
  const role          = (row[col.role]  || '').trim().toUpperCase();
  const zone          = row[col.zone]  || '';
  const manager_email = col.manager_email !== -1 ? (row[col.manager_email] || '').toLowerCase().trim() : '';

  // Skip rows where every field is blank
  if (!name && !email && !role && !zone) continue;

  let rowErrors = [];
  if (!name)                          rowErrors.push('name is empty');
  if (!email)                         rowErrors.push('email is empty');
  if (!VALID_ROLES.includes(role))    rowErrors.push(`role "${role}" invalid (must be ${VALID_ROLES.join('/')})`);
  if (!VALID_ZONES.includes(zone))    rowErrors.push(`zone "${zone}" invalid (must be ${VALID_ZONES.join('/')})`);

  if (rowErrors.length > 0) {
    errors.push(`  Row ${lineNo}: ${rowErrors.join('; ')}`);
    continue;
  }

  const user = { name: name.trim(), email, role, zone };
  if (manager_email) user.manager_email = manager_email;
  users.push(user);
}

// ── Report errors ─────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.warn(`\nWARNING: ${errors.length} row(s) skipped due to validation errors:`);
  errors.forEach(e => console.warn(e));
}

if (users.length === 0) {
  console.error('\nERROR: No valid users found. Nothing written.');
  process.exit(1);
}

// ── Write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(outputPath, JSON.stringify(users, null, 2));

console.log(`\nDone.`);
console.log(`  Valid rows  : ${users.length}`);
console.log(`  Skipped     : ${errors.length}`);
console.log(`  Output file : ${outputPath}`);
console.log(`\nTo import, run:`);
console.log(`  curl -X POST https://spa-app-orpin.vercel.app/api/admin/import-users \\`);
console.log(`       -H "Authorization: Bearer <ADMIN_SECRET>" \\`);
console.log(`       -H "Content-Type: application/json" \\`);
console.log(`       -d @${outputPath}`);
