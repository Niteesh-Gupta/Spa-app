'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// User model — table: users
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'users';

/**
 * @param {object} userData  camelCase — must include passwordHash, not password
 * @returns {object}         Created user (camelCase, no passwordHash)
 */
async function create(userData) {
  const row = toSnake(userData);
  const { data, error } = await db
    .from(TABLE)
    .insert(row)
    .select('id, email, name, role, zone, is_active, created_at, updated_at')
    .single();

  if (error) throw new Error(`User.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * @param {string} id  UUID
 * @returns {object|null}  User without passwordHash, or null
 */
async function findById(id) {
  const { data, error } = await db
    .from(TABLE)
    .select('id, email, name, role, zone, is_active, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`User.findById failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns the user including passwordHash — for auth use only.
 * @param {string} email
 * @returns {object|null}
 */
async function findByEmailWithPassword(email) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`User.findByEmailWithPassword failed: ${error.message}`);
  return toCamel(data);
}

/**
 * @param {string} id
 * @param {object} changes  camelCase
 * @returns {object}        Updated user (no passwordHash)
 */
async function update(id, changes) {
  const row = toSnake({ ...changes, updatedAt: new Date() });
  const { data, error } = await db
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('id, email, name, role, zone, is_active, created_at, updated_at')
    .single();

  if (error) throw new Error(`User.update failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns all active users (no passwords).
 * @returns {object[]}
 */
async function findAll() {
  const { data, error } = await db
    .from(TABLE)
    .select('id, email, name, role, zone, is_active, created_at, updated_at')
    .order('name');

  if (error) throw new Error(`User.findAll failed: ${error.message}`);
  return toCamelList(data);
}

/**
 * Returns all active users with a given role.
 * @param {string} role
 * @returns {object[]}
 */
async function findByRole(role) {
  const { data, error } = await db
    .from(TABLE)
    .select('id, email, name, role, zone, is_active, created_at, updated_at')
    .eq('role', role)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`User.findByRole failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { create, findById, findByEmailWithPassword, update, findAll, findByRole };
