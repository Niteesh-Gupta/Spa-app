'use strict';

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const authRouter     = require('./routes/auth');
const requestsRouter = require('./routes/requests');
const adminRouter    = require('./routes/admin');
const dealersRouter  = require('./routes/dealers');

const app = express();

// ── Security + parsing middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api',          authRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/dealers',  dealersRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status  = err.status  || 500;
  const message = err.expose  ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
