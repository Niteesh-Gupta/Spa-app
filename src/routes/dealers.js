'use strict';

const express  = require('express');
const supabase = require('../db/supabaseClient');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/dealers
// Returns id + name for all active dealers, ordered by name.
// Supports optional ?q= for server-side prefix filtering.
router.get('/', verifyToken, async (req, res) => {
  const q = (req.query.q || '').trim();

  let query = supabase
    .from('dealers')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
