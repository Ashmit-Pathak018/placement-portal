const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { getDb } = require('../db');
const { getUnreadCount, getNotifications } = require('../services/notifications');

// GET /api/notifications/unread-count
router.get('/notifications/unread-count', isAuthenticated, (req, res) => {
  try {
    const count = getUnreadCount(req.session.user.id);
    res.json({ count });
  } catch (err) {
    console.error('API unread-count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// GET /api/notifications — recent notifications for dropdown
router.get('/notifications', isAuthenticated, (req, res) => {
  try {
    const notifications = getNotifications(req.session.user.id, { limit: 6 });
    res.json({ notifications });
  } catch (err) {
    console.error('API notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/applications/status — returns current statuses for a student's applications
router.get('/applications/status', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'student') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const db = getDb();
    const apps = db.prepare(`
      SELECT a.id, a.status, a.updated_at, jp.title, c.name AS company_name
      FROM applications a
      JOIN job_postings jp ON a.posting_id = jp.id
      JOIN companies c ON jp.company_id = c.id
      WHERE a.student_id = ?
      ORDER BY a.updated_at DESC
    `).all(req.session.user.id);
    res.json({ applications: apps });
  } catch (err) {
    console.error('API application status error:', err);
    res.status(500).json({ error: 'Failed to fetch application statuses' });
  }
});

module.exports = router;
