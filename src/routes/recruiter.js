const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const csrfProtection = require('../middleware/csrf');
const { body, handleValidationErrors } = require('../middleware/validate');
const { getDb } = require('../db');
const config = require('../config');
const { updateApplicationStatus, batchUpdateStatus, getApplicationHistory } = require('../services/applications');

router.use(isAuthenticated, requireRole('recruiter'), csrfProtection);

// Helper to get recruiter's company
function getCompany(db, recruiterId) {
  return db.prepare('SELECT * FROM companies WHERE recruiter_id = ?').get(recruiterId);
}

// GET /recruiter/company
router.get('/company', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  res.render('recruiter/company', { title: 'My Company', company, csrfToken: req.csrfToken() });
});

// POST /recruiter/company
router.post('/company', [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Company name is required (max 100 characters).'),
  body('website').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Please provide a valid website URL starting with http:// or https://.'),
  body('description').optional().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters.'),
  handleValidationErrors('recruiter/company')
], (req, res) => {
  const db = getDb();
  const existing = getCompany(db, req.session.user.id);
  if (existing) {
    req.flash('error', 'Company profile already exists.');
    return res.redirect('/recruiter/company');
  }
  const { name, website, description } = req.body;
  db.prepare(`
    INSERT INTO companies (recruiter_id, name, website, description, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(req.session.user.id, name, website || '', description || '');
  
  req.flash('success', 'Company profile created! It is currently pending placement cell approval.');
  res.redirect('/recruiter/company');
});

// GET /recruiter/company/edit
router.get('/company/edit', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) {
    req.flash('error', 'Company profile not found.');
    return res.redirect('/recruiter/company');
  }
  res.render('recruiter/company-edit', { title: 'Edit Company Profile', company, csrfToken: req.csrfToken() });
});

// POST /recruiter/company/edit
router.post('/company/edit', [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Company name is required (max 100 characters).'),
  body('website').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('Please provide a valid website URL starting with http:// or https://.'),
  body('description').optional().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters.'),
  handleValidationErrors('recruiter/company-edit')
], (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) {
    req.flash('error', 'Company profile not found.');
    return res.redirect('/recruiter/company');
  }
  const { name, website, description } = req.body;
  db.prepare('UPDATE companies SET name = ?, website = ?, description = ? WHERE id = ?')
    .run(name, website || '', description || '', company.id);
  req.flash('success', 'Company profile updated successfully.');
  res.redirect('/recruiter/company');
});

// GET /recruiter/postings
router.get('/postings', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) {
    req.flash('error', 'Please create a company profile first.');
    return res.redirect('/recruiter/company');
  }
  const postings = db.prepare(`
    SELECT p.*, 
    (SELECT COUNT(*) FROM applications a WHERE a.posting_id = p.id) as applicant_count 
    FROM job_postings p 
    WHERE p.company_id = ?
    ORDER BY p.created_at DESC
  `).all(company.id);

  res.render('recruiter/postings', { title: 'My Postings', postings, company, csrfToken: req.csrfToken() });
});

// GET /recruiter/postings/new
router.get('/postings/new', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company || company.status !== 'approved') {
    req.flash('error', 'Your company must be approved by the Placement Cell before creating job postings.');
    return res.redirect('/recruiter/postings');
  }
  res.render('recruiter/posting-form', {
    title: 'Create Job Posting',
    posting: null,
    branches: [],
    csrfToken: req.csrfToken()
  });
});

// POST /recruiter/postings/new
router.post('/postings/new', [
  body('title').trim().notEmpty().isLength({ max: 150 }).withMessage('Title is required (max 150 characters).'),
  body('description').trim().notEmpty().isLength({ max: 5000 }).withMessage('Description is required (max 5000 characters).'),
  body('type').isIn(['job', 'internship']).withMessage('Type must be job or internship.'),
  body('min_cgpa').isFloat({ min: 0, max: 10 }).withMessage('Minimum CGPA must be between 0 and 10.'),
  body('deadline').isISO8601().withMessage('Application deadline must be a valid date (YYYY-MM-DD).'),
  handleValidationErrors('recruiter/postings/new')
], (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company || company.status !== 'approved') {
    req.flash('error', 'Your company must be approved to create postings.');
    return res.redirect('/recruiter/postings');
  }
  const { title, description, type, min_cgpa, grad_year, deadline, branches } = req.body;
  const branchesArr = Array.isArray(branches) ? branches : (branches ? [branches] : []);

  db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO job_postings (company_id, title, description, type, min_cgpa, grad_year, deadline, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      company.id,
      title,
      description,
      type,
      parseFloat(min_cgpa) || 0,
      grad_year ? parseInt(grad_year, 10) : null,
      deadline
    );

    const postingId = result.lastInsertRowid;
    const insertDept = db.prepare('INSERT INTO posting_departments (posting_id, branch) VALUES (?, ?)');
    for (const b of branchesArr) {
      insertDept.run(postingId, b);
    }
  })();

  req.flash('success', 'Posting created! It is pending approval from the Placement Cell.');
  res.redirect('/recruiter/postings');
});

// GET /recruiter/postings/:id/edit
router.get('/postings/:id/edit', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.redirect('/recruiter/company');

  const posting = db.prepare('SELECT * FROM job_postings WHERE id = ? AND company_id = ?')
    .get(req.params.id, company.id);
  if (!posting) {
    req.flash('error', 'Posting not found.');
    return res.redirect('/recruiter/postings');
  }
  const departments = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?').all(posting.id);
  const branches = departments.map(d => d.branch);

  res.render('recruiter/posting-form', {
    title: 'Edit Posting',
    posting,
    branches,
    csrfToken: req.csrfToken()
  });
});

// POST /recruiter/postings/:id/edit
router.post('/postings/:id/edit', [
  body('title').trim().notEmpty().isLength({ max: 150 }).withMessage('Title is required (max 150 characters).'),
  body('description').trim().notEmpty().isLength({ max: 5000 }).withMessage('Description is required (max 5000 characters).'),
  body('type').isIn(['job', 'internship']).withMessage('Type must be job or internship.'),
  body('min_cgpa').isFloat({ min: 0, max: 10 }).withMessage('Minimum CGPA must be between 0 and 10.'),
  body('deadline').isISO8601().withMessage('Application deadline must be a valid date (YYYY-MM-DD).'),
  handleValidationErrors(req => `/recruiter/postings/${req.params.id}/edit`)
], (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.redirect('/recruiter/company');

  const posting = db.prepare('SELECT * FROM job_postings WHERE id = ? AND company_id = ?')
    .get(req.params.id, company.id);
  if (!posting) {
    req.flash('error', 'Posting not found or unauthorized.');
    return res.redirect('/recruiter/postings');
  }

  const { title, description, type, min_cgpa, grad_year, deadline, branches } = req.body;
  const branchesArr = Array.isArray(branches) ? branches : (branches ? [branches] : []);

  db.transaction(() => {
    db.prepare(`
      UPDATE job_postings 
      SET title = ?, description = ?, type = ?, min_cgpa = ?, grad_year = ?, deadline = ?
      WHERE id = ?
    `).run(
      title,
      description,
      type,
      parseFloat(min_cgpa) || 0,
      grad_year ? parseInt(grad_year, 10) : null,
      deadline,
      posting.id
    );

    db.prepare('DELETE FROM posting_departments WHERE posting_id = ?').run(posting.id);
    const insertDept = db.prepare('INSERT INTO posting_departments (posting_id, branch) VALUES (?, ?)');
    for (const b of branchesArr) {
      insertDept.run(posting.id, b);
    }
  })();

  req.flash('success', 'Posting updated successfully.');
  res.redirect('/recruiter/postings');
});

// GET /recruiter/postings/:id/applicants (Table & Kanban view)
router.get('/postings/:id/applicants', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.redirect('/recruiter/company');

  const posting = db.prepare('SELECT * FROM job_postings WHERE id = ? AND company_id = ?')
    .get(req.params.id, company.id);
  if (!posting) {
    req.flash('error', 'Posting not found or access denied.');
    return res.redirect('/recruiter/postings');
  }

  const applicants = db.prepare(`
    SELECT a.id as application_id, a.status, a.applied_at,
           COALESCE(sp.name, u.email) as name, u.email, sp.branch, sp.cgpa
    FROM applications a
    JOIN users u ON a.student_id = u.id
    LEFT JOIN student_profiles sp ON u.id = sp.user_id
    WHERE a.posting_id = ?
    ORDER BY a.applied_at DESC
  `).all(posting.id);

  const statuses = config.applicationStatuses;

  res.render('recruiter/applicants', {
    title: `Applicants: ${posting.title}`,
    posting,
    applicants,
    statuses,
    csrfToken: req.csrfToken()
  });
});

// GET /recruiter/applicants/:appId
router.get('/applicants/:appId', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.redirect('/recruiter/company');

  const application = db.prepare(`
    SELECT a.id, a.status, a.applied_at, a.posting_id,
           u.id as student_id, COALESCE(sp.name, u.email) as name, u.email, 
           sp.branch, sp.cgpa, sp.grad_year, sp.resume_url,
           p.title as posting_title
    FROM applications a
    JOIN users u ON a.student_id = u.id
    LEFT JOIN student_profiles sp ON u.id = sp.user_id
    JOIN job_postings p ON a.posting_id = p.id
    WHERE a.id = ? AND p.company_id = ?
  `).get(req.params.appId, company.id);

  if (!application) {
    req.flash('error', 'Application not found or unauthorized.');
    return res.redirect('/recruiter/postings');
  }

  const history = getApplicationHistory(application.id);
  const allowedTransitions = config.allowedTransitions[application.status] || [];

  res.render('recruiter/applicant-detail', {
    title: `Applicant: ${application.name}`,
    application,
    history,
    allowedTransitions,
    csrfToken: req.csrfToken()
  });
});

// POST /recruiter/applications/:id/status (Single transition)
router.post('/applications/:id/status', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.status(403).json({ error: 'Company not found' });

  const application = db.prepare(`
    SELECT a.id, p.id as posting_id
    FROM applications a
    JOIN job_postings p ON a.posting_id = p.id
    WHERE a.id = ? AND p.company_id = ?
  `).get(req.params.id, company.id);

  if (!application) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(404).json({ error: 'Application not found or unauthorized.' });
    }
    req.flash('error', 'Application not found or unauthorized.');
    return res.redirect('/recruiter/postings');
  }

  const { status, note } = req.body;
  const result = updateApplicationStatus(req.params.id, status, req.session.user.id, note || '');

  if (!result.success) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: result.error });
    }
    req.flash('error', result.error);
    return res.redirect(`/recruiter/applicants/${req.params.id}`);
  }

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ success: true });
  }

  req.flash('success', `Status updated to ${status}.`);
  res.redirect(`/recruiter/postings/${application.posting_id}/applicants`);
});

// POST /recruiter/applications/batch-status (Batch transition)
router.post('/applications/batch-status', (req, res) => {
  const db = getDb();
  const company = getCompany(db, req.session.user.id);
  if (!company) return res.redirect('/recruiter/company');

  let { applicationIds, newStatus, note, postingId } = req.body;

  if (!applicationIds || !newStatus) {
    req.flash('error', 'Please select applicants and a new status.');
    return res.redirect(postingId ? `/recruiter/postings/${postingId}/applicants` : 'back');
  }

  if (!Array.isArray(applicationIds)) {
    applicationIds = [applicationIds];
  }

  // Parse and filter valid positive integer application IDs
  applicationIds = applicationIds
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id) && id > 0);

  if (applicationIds.length === 0) {
    req.flash('error', 'No valid applicants selected.');
    return res.redirect(postingId ? `/recruiter/postings/${postingId}/applicants` : 'back');
  }

  // Verify ownership of every application
  for (const id of applicationIds) {
    const app = db.prepare(`
      SELECT a.id FROM applications a
      JOIN job_postings p ON a.posting_id = p.id
      WHERE a.id = ? AND p.company_id = ?
    `).get(id, company.id);
    if (!app) {
      req.flash('error', 'Unauthorized access to one or more applications.');
      return res.redirect(postingId ? `/recruiter/postings/${postingId}/applicants` : 'back');
    }
  }

  try {
    const { results } = batchUpdateStatus(applicationIds, newStatus, req.session.user.id, note || '');
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      const errMsgs = failures.map(f => `App #${f.applicationId}: ${f.error}`).join('; ');
      req.flash('error', `Some updates failed: ${errMsgs}`);
    } else {
      req.flash('success', `Successfully updated ${results.length} application(s) to ${newStatus}.`);
    }
  } catch (err) {
    req.flash('error', err.message);
  }

  res.redirect(postingId ? `/recruiter/postings/${postingId}/applicants` : '/recruiter/postings');
});

module.exports = router;
