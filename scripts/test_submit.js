'use strict';
// Test: login as TM, submit a request, verify it appears in GET
const https = require('https');

const API = 'https://spa-app-orpin.vercel.app';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(API + path);
    const opts = {
      hostname: url.hostname, path: url.pathname,
      method: 'POST', port: 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
    };
    const req = https.request(opts, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const opts = {
      hostname: url.hostname, path: url.pathname,
      method: 'GET', port: 443,
      headers: { 'Authorization': 'Bearer ' + token },
    };
    const req = https.request(opts, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  // 1. Login
  console.log('1. Logging in as Amit Sharma (TM)…');
  const login = await post('/api/login', { email: 'intm1@coloplast.com', password: 'Password@123' });
  if (!login.body.token) { console.error('Login failed:', login.body); process.exit(1); }
  const token = login.body.token;
  console.log('   OK — token received\n');

  // 2. Submit a test request
  console.log('2. POST /api/requests…');
  const payload = {
    id: 'SPA-022',
    date: '2026-04-05',
    tm: 'Amit Sharma',
    customer: 'Apollo Hospitals Bangalore',
    dealer: 'MediSupply South',
    product: 'Alterna 1PC OPEN MX TR 10/80MM',
    stdPrice: 431,
    reqPrice: 340,
    sdrPct: 21.1,
    volume: 200,
    justification: 'Annual supply tender for Apollo chain South region',
    dealStage: 'Negotiation In Progress',
    status: 'Pending RSM',
    tier: 'RSM',
    linkedTo: null,
    extraInfo: null,
  };
  const save = await post('/api/requests', payload, token);
  console.log('   HTTP status:', save.status);
  if (save.status !== 201) {
    console.error('   ERROR:', JSON.stringify(save.body));
    process.exit(1);
  }
  console.log('   Saved row:', JSON.stringify(save.body, null, 4));

  // 3. GET to confirm it persisted
  console.log('\n3. GET /api/requests…');
  const list = await get('/api/requests', token);
  console.log('   Returned', list.body.length, 'row(s):');
  (list.body || []).forEach(r =>
    console.log('  ', r.id, '|', r.tm, '|', r.customer, '|', r.status)
  );
}

run().catch(e => { console.error(e); process.exit(1); });
