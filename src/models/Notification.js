'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Notification model — table: notifications
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'notifications';

/**
 * Queue a notification for delivery.
 * @param {{
 *   spaId?:        string,
 *   event:         string,
 *   recipientRole?: string,
 *   recipientId?:   string,
 *   payload:       object,
 * }} notif
 * @returns {object}  Created notification (camelCase)
 */
async function queue(notif) {
  const row = toSnake({ ...notif, status: 'QUEUED' });
  const { data, error } = await db
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Notification.queue failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Mark a notification as sent.
 * @param {string} id  UUID
 * @returns {object}
 */
async function markSent(id) {
  const { data, error } = await db
    .from(TABLE)
    .update({ status: 'SENT', sent_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Notification.markSent failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Mark a notification as failed.
 * @param {string} id  UUID
 * @returns {object}
 */
async function markFailed(id) {
  const { data, error } = await db
    .from(TABLE)
    .update({ status: 'FAILED' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Notification.markFailed failed: ${error.message}`);
  return toCamel(data);
}

/**
 * Returns all queued notifications (for the delivery worker).
 * @returns {object[]}
 */
async function findQueued() {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('status', 'QUEUED')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Notification.findQueued failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { queue, markSent, markFailed, findQueued };
