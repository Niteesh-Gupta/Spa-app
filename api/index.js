'use strict';

// Vercel serverless entry point.
// Vercel calls this module as a function — exporting the Express app is enough.

require('dotenv').config();

const app = require('../src/app');

module.exports = app;
