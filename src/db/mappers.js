'use strict';

// ── camelCase ↔ snake_case mappers ────────────────────────────────────────────
//
// Supabase returns column names in snake_case.
// The service + workflow layer uses camelCase throughout.
// All models run their inputs through toSnake() before writes
// and their outputs through toCamel() before returning.

/**
 * Converts a snake_case DB row to a camelCase JS object.
 * Works one level deep — nested JSONB objects are left as-is
 * (they are already parsed by the Supabase client).
 *
 * @param {object|null} row
 * @returns {object|null}
 */
function toCamel(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      v,
    ])
  );
}

/**
 * Converts a camelCase JS object to a snake_case object for DB writes.
 * Skips keys with undefined values (avoids sending nulls unintentionally).
 *
 * @param {object|null} obj
 * @returns {object|null}
 */
function toSnake(obj) {
  if (!obj) return null;
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v,
      ])
  );
}

/**
 * Map an array of rows to camelCase.
 * @param {object[]} rows
 * @returns {object[]}
 */
function toCamelList(rows) {
  return (rows || []).map(toCamel);
}

module.exports = { toCamel, toSnake, toCamelList };
