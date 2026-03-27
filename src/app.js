'use strict';

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const app = express();

// ── Security + parsing middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
// Wired incrementally as each layer is built:
//
// app.use('/api/auth', require('./api/auth'));
// app.use('/api/spa',  require('./api/spa'));
// app.use('/api/admin', require('./api/admin'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Express requires 4-arg signature for error middleware.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status  = err.status  || 500;
  // Only surface message to client when explicitly marked safe
  const message = err.expose  ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
