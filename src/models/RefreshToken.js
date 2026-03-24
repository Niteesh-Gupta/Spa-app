'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// RefreshToken model — table: refresh_tokens
// Stores hashed refresh tokens for JWT rotation.
// ─────────────────────────────────────────────────────────────────────────────

const db          = require('../db/supabaseClient');
const { toCamel } = require('../db/mappers');

const TABLE = 'refresh_tokens';

/**
 * Store a new refresh token.
 * @param {{
 *   userId:    string,  // UUID
 *   tokenHash: string,  // bcrypt hash of the raw token
 *   expiresAt: Date,
 * }} tokenData
 * @returns {object}
 */
async function create(tokenData) {
  const { data, error } = await db
    .from(TABLE)
    .insert({
      user_id:    tokenData.userId,
      token_hash: tokenData.tokenHash,
      expires_at: tokenData.expiresAt instanceof Date
        ? tokenData.expiresAt.toISOString()
        : tokenData.expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(`RefreshToken.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Find a token record by its hash.
 * @param {string} tokenHash
 * @returns {object|null}
 */
async function findByHash(tokenHash) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`RefreshToken.findByHash failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Revoke a specific token (e.g. on logout or rotation).
 * @param {string} id  UUID
 */
async function revoke(id) {
  const { error } = await db
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`RefreshToken.revoke failed: ${error.message}`);
}

/**
 * Revoke all tokens for a user (e.g. on password change or account disable).
 * @param {string} userId  UUID
 */
async function revokeAllForUser(userId) {
  const { error } = await db
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) throw new Error(`RefreshToken.revokeAllForUser failed: ${error.message}`);
}

module.exports = { create, findByHash, revoke, revokeAllForUser };
