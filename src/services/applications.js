/**
 * Application service — status transitions (single & batch), history tracking.
 */
const { getDb } = require('../db');
const config = require('../config');
const { createNotification } = require('./notifications');

/**
 * Validate and apply a single status transition.
 * Returns { success, error? }
 */
function updateApplicationStatus(applicationId, newStatus, changedBy, note = '') {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);

  if (!app) {
    return { success: false, error: 'Application not found.' };
  }

  const allowed = config.allowedTransitions[app.status] || [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${app.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (final state)'}.`,
    };
  }

  const txn = db.transaction(() => {
    // Update application status
    db.prepare('UPDATE applications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newStatus, applicationId);

    // Record history
    db.prepare(`
      INSERT INTO application_history (application_id, from_status, to_status, changed_by, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(applicationId, app.status, newStatus, changedBy, note);

    // Notify the student
    const posting = db.prepare(`
      SELECT jp.title, c.name AS company_name
      FROM job_postings jp
      JOIN companies c ON jp.company_id = c.id
      WHERE jp.id = ?
    `).get(app.posting_id);

    const statusLabel = newStatus.replace(/_/g, ' ');
    const message = posting
      ? `Your application for "${posting.title}" at ${posting.company_name} has been updated to: ${statusLabel}.`
      : `Your application status has been updated to: ${statusLabel}.`;

    createNotification(app.student_id, message, `/student/applications/${applicationId}`);
  });

  txn();
  return { success: true };
}

/**
 * Batch status update — transactional. Returns results per application.
 * { results: [{ applicationId, success, error? }] }
 */
function batchUpdateStatus(applicationIds, newStatus, changedBy, note = '') {
  const db = getDb();
  const results = [];

  const txn = db.transaction(() => {
    for (const appId of applicationIds) {
      const result = updateApplicationStatusInner(db, appId, newStatus, changedBy, note);
      results.push({ applicationId: appId, ...result });
    }
  });

  txn();
  return { results };
}

/**
 * Inner (non-transactional) single update for use inside batch transactions.
 */
function updateApplicationStatusInner(db, applicationId, newStatus, changedBy, note) {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);

  if (!app) {
    return { success: false, error: 'Application not found.' };
  }

  const allowed = config.allowedTransitions[app.status] || [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${app.status}" to "${newStatus}".`,
    };
  }

  db.prepare('UPDATE applications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(newStatus, applicationId);

  db.prepare(`
    INSERT INTO application_history (application_id, from_status, to_status, changed_by, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(applicationId, app.status, newStatus, changedBy, note);

  // Notify student
  const posting = db.prepare(`
    SELECT jp.title, c.name AS company_name
    FROM job_postings jp JOIN companies c ON jp.company_id = c.id
    WHERE jp.id = ?
  `).get(app.posting_id);

  const statusLabel = newStatus.replace(/_/g, ' ');
  const message = posting
    ? `Your application for "${posting.title}" at ${posting.company_name} has been updated to: ${statusLabel}.`
    : `Your application status has been updated to: ${statusLabel}.`;

  db.prepare(`
    INSERT INTO notifications (user_id, message, link)
    VALUES (?, ?, ?)
  `).run(app.student_id, message, `/student/applications/${applicationId}`);

  return { success: true };
}

/**
 * Get application history timeline.
 */
function getApplicationHistory(applicationId) {
  const db = getDb();
  return db.prepare(`
    SELECT ah.*, u.email AS changed_by_email
    FROM application_history ah
    LEFT JOIN users u ON ah.changed_by = u.id
    WHERE ah.application_id = ?
    ORDER BY ah.changed_at ASC
  `).all(applicationId);
}

module.exports = { updateApplicationStatus, batchUpdateStatus, getApplicationHistory };
