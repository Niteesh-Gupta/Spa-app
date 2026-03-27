'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Product model — table: products
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'products';

async function create(productData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(productData))
    .select()
    .single();

  if (error) throw new Error(`Product.create failed: ${error.message}`);
  return toCamel(data);
}

async function findById(id) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Product.findById failed: ${error.message}`);
  return toCamel(data);
}

async function findAll(activeOnly = true) {
  let query = db.from(TABLE).select('*').order('name');
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Product.findAll failed: ${error.message}`);
  return toCamelList(data);
}

async function update(id, changes) {
  const { data, error } = await db
    .from(TABLE)
    .update(toSnake({ ...changes, updatedAt: new Date() }))
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Product.update failed: ${error.message}`);
  return toCamel(data);
}

module.exports = { create, findById, findAll, update };
