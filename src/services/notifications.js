/**
 * Notifications service.
 */
const { getDb } = require('../db');

function createNotification(userId, message, link = '') {
  const db = getDb();
  db.prepare('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)')
    .run(userId, message, link);
}

function getNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  const db = getDb();
  const where = unreadOnly ? 'AND is_read = 0' : '';
  return db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function getUnreadCount(userId) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId);
  return row.count;
}

function markAsRead(notificationId, userId) {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(notificationId, userId);
}

function markAllAsRead(userId) {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(userId);
}

module.exports = { createNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead };
