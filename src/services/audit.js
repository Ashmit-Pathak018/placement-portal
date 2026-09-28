/**
 * Audit service — admin review actions logged transactionally.
 */
const { getDb } = require('../db');

/**
 * Approve or reject a company, with audit log in one transaction.
 */
function reviewCompany(companyId, action, adminId, reason = '') {
  if (!['approved', 'rejected'].includes(action)) {
    throw new Error('Invalid action. Must be "approved" or "rejected".');
  }

  const db = getDb();

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE companies SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
    `).run(action, adminId, companyId);

    db.prepare(`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, reason)
      VALUES (?, 'company', ?, ?, ?)
    `).run(adminId, companyId, action, reason);

    // Notify the recruiter
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (company) {
      const msg = action === 'approved'
        ? `Your company "${company.name}" has been approved by the placement cell.`
        : `Your company "${company.name}" has been rejected. Reason: ${reason || 'Not specified'}.`;
      db.prepare(`
        INSERT INTO notifications (user_id, message, link)
        VALUES (?, ?, ?)
      `).run(company.recruiter_id, msg, '/recruiter/company');
    }
  });

  txn();
}

/**
 * Approve or reject a job posting, with audit log in one transaction.
 */
function reviewPosting(postingId, action, adminId, reason = '') {
  if (!['approved', 'rejected'].includes(action)) {
    throw new Error('Invalid action. Must be "approved" or "rejected".');
  }

  const db = getDb();

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE job_postings SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
    `).run(action, adminId, postingId);

    db.prepare(`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, reason)
      VALUES (?, 'posting', ?, ?, ?)
    `).run(adminId, postingId, action, reason);

    // Notify the recruiter via the company
    const posting = db.prepare(`
      SELECT jp.title, c.recruiter_id
      FROM job_postings jp JOIN companies c ON jp.company_id = c.id
      WHERE jp.id = ?
    `).get(postingId);

    if (posting) {
      const msg = action === 'approved'
        ? `Your posting "${posting.title}" has been approved and is now live.`
        : `Your posting "${posting.title}" has been rejected. Reason: ${reason || 'Not specified'}.`;
      db.prepare(`
        INSERT INTO notifications (user_id, message, link)
        VALUES (?, ?, ?)
      `).run(posting.recruiter_id, msg, '/recruiter/postings');
    }
  });

  txn();
}

/**
 * Fetch audit logs with optional filters.
 */
function getAuditLogs({ entityType, action, startDate, endDate, page = 1, limit = 50 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (entityType) {
    conditions.push('al.entity_type = ?');
    params.push(entityType);
  }
  if (action) {
    conditions.push('al.action = ?');
    params.push(action);
  }
  if (startDate) {
    conditions.push('al.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('al.created_at <= ?');
    params.push(endDate);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const rows = db.prepare(`
    SELECT al.*, u.email AS admin_email
    FROM admin_audit_logs al
    LEFT JOIN users u ON al.admin_id = u.id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total FROM admin_audit_logs al ${where}
  `).get(...params);

  return { logs: rows, total: countRow.total, page, limit };
}

module.exports = { reviewCompany, reviewPosting, getAuditLogs };
