const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const csrfProtection = require('../middleware/csrf');
const { getDb } = require('../db');
const { reviewCompany, reviewPosting, getAuditLogs } = require('../services/audit');

router.use(isAuthenticated, requireRole('admin'));

// GET /admin/dashboard
router.get('/dashboard', csrfProtection, (req, res) => {
  const db = getDb();
  
  const pendingCompanies = db.prepare(`SELECT count(*) as count FROM companies WHERE status = 'pending'`).get().count;
  const pendingPostings = db.prepare(`SELECT count(*) as count FROM job_postings WHERE status = 'pending'`).get().count;
  const totalApplications = db.prepare(`SELECT count(*) as count FROM applications`).get().count;
  const totalStudents = db.prepare(`SELECT count(*) as count FROM users WHERE role = 'student'`).get().count;

  // Analytics Chart 1: Placements (offered) by Branch
  const placementsByBranch = db.prepare(`
    SELECT p.branch, count(*) as count 
    FROM applications a
    JOIN student_profiles p ON a.student_id = p.user_id
    WHERE a.status = 'offered' AND p.branch != ''
    GROUP BY p.branch
  `).all();

  // Analytics Chart 2: Applications per Company
  const applicationsPerCompany = db.prepare(`
    SELECT c.name as company, count(*) as count
    FROM applications a
    JOIN job_postings p ON a.posting_id = p.id
    JOIN companies c ON p.company_id = c.id
    GROUP BY c.name
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // Analytics Chart 3: Average CGPA of Offered Students by Branch
  const avgCgpaByBranch = db.prepare(`
    SELECT p.branch, ROUND(AVG(p.cgpa), 2) as avgCgpa
    FROM applications a
    JOIN student_profiles p ON a.student_id = p.user_id
    WHERE a.status = 'offered' AND p.branch != ''
    GROUP BY p.branch
  `).all();

  res.render('admin/dashboard', {
    title: 'Placement Cell Admin Dashboard',
    csrfToken: req.csrfToken(),
    stats: {
      pendingCompanies,
      pendingPostings,
      totalApplications,
      totalStudents
    },
    charts: {
      placementsByBranch,
      applicationsPerCompany,
      avgCgpaByBranch
    }
  });
});

// GET /admin/companies/pending
router.get('/companies/pending', csrfProtection, (req, res) => {
  const db = getDb();
  const companies = db.prepare(`
    SELECT c.*, u.email as recruiter_email 
    FROM companies c
    JOIN users u ON c.recruiter_id = u.id
    WHERE c.status = 'pending'
    ORDER BY c.created_at ASC
  `).all();

  res.render('admin/pending-companies', {
    title: 'Pending Companies Queue',
    csrfToken: req.csrfToken(),
    companies
  });
});

// Helper to sanitize CSV cells against Formula Injection (=, +, -, @)
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

// POST /admin/companies/:id/review
router.post('/companies/:id/review', csrfProtection, (req, res) => {
  const { action, reason } = req.body;
  const companyId = parseInt(req.params.id, 10);
  
  if (isNaN(companyId)) {
    req.flash('error', 'Invalid company ID.');
    return res.redirect('/admin/companies/pending');
  }

  if (!['approved', 'rejected'].includes(action)) {
    req.flash('error', 'Invalid action.');
    return res.redirect('/admin/companies/pending');
  }

  try {
    reviewCompany(companyId, action, req.session.user.id, reason || '');
    req.flash('success', `Company #${companyId} has been ${action}.`);
  } catch (err) {
    console.error('Company review error:', err);
    req.flash('error', 'Error reviewing company: ' + err.message);
  }
  
  res.redirect('/admin/companies/pending');
});

// GET /admin/postings/pending
router.get('/postings/pending', csrfProtection, (req, res) => {
  const db = getDb();
  const postings = db.prepare(`
    SELECT p.*, c.name as company_name 
    FROM job_postings p
    JOIN companies c ON p.company_id = c.id
    WHERE p.status = 'pending'
    ORDER BY p.created_at ASC
  `).all();

  postings.forEach(p => {
    p.job_type = p.type;
    const branches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?')
      .all(p.id)
      .map(r => r.branch);
    p.eligible_branches = branches.length > 0 ? branches.join(', ') : 'All Branches';
  });

  res.render('admin/pending-postings', {
    title: 'Pending Postings Queue',
    csrfToken: req.csrfToken(),
    postings
  });
});

// POST /admin/postings/:id/review
router.post('/postings/:id/review', csrfProtection, (req, res) => {
  const { action, reason } = req.body;
  const postingId = parseInt(req.params.id, 10);
  
  if (isNaN(postingId)) {
    req.flash('error', 'Invalid posting ID.');
    return res.redirect('/admin/postings/pending');
  }

  if (!['approved', 'rejected'].includes(action)) {
    req.flash('error', 'Invalid review action.');
    return res.redirect('/admin/postings/pending');
  }

  try {
    reviewPosting(postingId, action, req.session.user.id, reason || '');
    req.flash('success', `Posting #${postingId} has been ${action}.`);
  } catch (err) {
    console.error('Posting review error:', err);
    req.flash('error', 'Error reviewing posting: ' + err.message);
  }
  
  res.redirect('/admin/postings/pending');
});

// GET /admin/audit-logs
router.get('/audit-logs', csrfProtection, (req, res) => {
  const { entity_type, action, startDate, endDate, page = 1 } = req.query;
  const limit = 50;
  const currentPage = parseInt(page, 10) || 1;
  
  try {
    const logsData = getAuditLogs({
      entityType: entity_type || null,
      action: action || null,
      startDate: startDate || null,
      endDate: endDate || null,
      page: currentPage,
      limit
    });
    
    const totalPages = Math.ceil(logsData.total / limit) || 1;

    res.render('admin/audit-logs', {
      title: 'Audit Logs',
      csrfToken: req.csrfToken(),
      logs: logsData.logs,
      pagination: { currentPage, totalPages, total: logsData.total },
      filters: { entity_type, action, startDate, endDate }
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    req.flash('error', 'Error fetching audit logs.');
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/audit-logs/export.csv
router.get('/audit-logs/export.csv', (req, res) => {
  const { entity_type, action, startDate, endDate } = req.query;
  const db = getDb();
  
  let query = `
    SELECT al.*, u.email as admin_email 
    FROM admin_audit_logs al
    LEFT JOIN users u ON al.admin_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (entity_type) {
    query += ` AND al.entity_type = ?`;
    params.push(entity_type);
  }
  if (action) {
    query += ` AND al.action = ?`;
    params.push(action);
  }
  if (startDate) {
    query += ` AND al.created_at >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND al.created_at <= ?`;
    params.push(endDate + ' 23:59:59');
  }

  query += ` ORDER BY al.created_at DESC`;

  try {
    const logs = db.prepare(query).all(...params);
    
    const headers = ['Date', 'Admin Email', 'Entity Type', 'Entity ID', 'Action', 'Reason'];
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      csvRows.push([
        sanitizeCsvCell(log.created_at),
        sanitizeCsvCell(log.admin_email || 'System'),
        sanitizeCsvCell(log.entity_type),
        sanitizeCsvCell(log.entity_id),
        sanitizeCsvCell(log.action),
        sanitizeCsvCell(log.reason || '')
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csvRows.join('\r\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).send('Error exporting CSV');
  }
});

module.exports = router;
