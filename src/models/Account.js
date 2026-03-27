'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Account model — table: accounts
// Accounts are hospitals / institutions / clinics (end customers).
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'accounts';

async function create(accountData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(accountData))
    .select()
    .single();

  if (error) throw new Error(`Account.create failed: ${error.message}`);
  return toCamel(data);
}

async function findById(id) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Account.findById failed: ${error.message}`);
  return toCamel(data);
}

async function search(query) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .ilike('name', `%${query}%`)
    .eq('is_active', true)
    .order('name')
    .limit(20);

  if (error) throw new Error(`Account.search failed: ${error.message}`);
  return toCamelList(data);
}

async function findAll(activeOnly = true) {
  let q = db.from(TABLE).select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw new Error(`Account.findAll failed: ${error.message}`);
  return toCamelList(data);
}

async function update(id, changes) {
  const { data, error } = await db
    .from(TABLE)
    .update(toSnake({ ...changes, updatedAt: new Date() }))
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Account.update failed: ${error.message}`);
  return toCamel(data);
}

module.exports = { create, findById, search, findAll, update };
