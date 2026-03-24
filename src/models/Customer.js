'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Customer model — table: customers
// Contact persons linked to an account.
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'customers';

async function create(customerData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(customerData))
    .select()
    .single();

  if (error) throw new Error(`Customer.create failed: ${error.message}`);
  return toCamel(data);
}

async function findById(id) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Customer.findById failed: ${error.message}`);
  return toCamel(data);
}

async function findByAccountId(accountId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('name');

  if (error) throw new Error(`Customer.findByAccountId failed: ${error.message}`);
  return toCamelList(data);
}

async function update(id, changes) {
  const { data, error } = await db
    .from(TABLE)
    .update(toSnake({ ...changes, updatedAt: new Date() }))
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Customer.update failed: ${error.message}`);
  return toCamel(data);
}

module.exports = { create, findById, findByAccountId, update };
