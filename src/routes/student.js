const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const csrfProtection = require('../middleware/csrf');
const { body, handleValidationErrors } = require('../middleware/validate');
const { getDb } = require('../db');
const config = require('../config');
const { canApply, whatIf, checkEligibility } = require('../services/eligibility');
const { calculateMatchScore } = require('../services/matchScore');
const { getApplicationHistory } = require('../services/applications');
const { getNotifications, markAllAsRead } = require('../services/notifications');

router.use(isAuthenticated, requireRole('student'));

// Helper to get student profile record
const getStudent = (db, userId) => {
  return db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
};

// GET /student/dashboard
router.get('/dashboard', csrfProtection, (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  
  let student = getStudent(db, userId);
  if (!student) {
    db.prepare('INSERT OR IGNORE INTO student_profiles (user_id) VALUES (?)').run(userId);
    student = getStudent(db, userId);
  }

  // Stats
  const totalApps = db.prepare('SELECT COUNT(*) as count FROM applications WHERE student_id = ?').get(userId).count;
  const pendingApps = db.prepare(`
    SELECT COUNT(*) as count FROM applications 
    WHERE student_id = ? AND status IN ('applied', 'under_review', 'shortlisted', 'interview')
  `).get(userId).count;
  const offeredApps = db.prepare(`
    SELECT COUNT(*) as count FROM applications 
    WHERE student_id = ? AND status = 'offered'
  `).get(userId).count;

  // Recommended postings (approved & non-expired)
  const postings = db.prepare(`
    SELECT jp.*, c.name AS company_name 
    FROM job_postings jp 
    JOIN companies c ON jp.company_id = c.id 
    WHERE jp.status = 'approved' AND c.status = 'approved' AND jp.deadline >= date('now')
  `).all();
  
  const recommended = postings.map(p => {
    const branches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?').all(p.id).map(b => b.branch);
    p.allowed_branches = branches;
    const match = calculateMatchScore(student, p, branches);
    p.match_score = match.score;
    return p;
  }).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  // Recent apps
  const recentApps = db.prepare(`
    SELECT a.*, jp.title, c.name as company_name 
    FROM applications a
    JOIN job_postings jp ON a.posting_id = jp.id
    JOIN companies c ON jp.company_id = c.id
    WHERE a.student_id = ?
    ORDER BY a.applied_at DESC LIMIT 5
  `).all(userId);

  // Notifications
  const notifications = getNotifications(userId, { limit: 10 });

  res.render('student/dashboard', {
    title: 'Student Dashboard',
    csrfToken: req.csrfToken(),
    student,
    stats: { total: totalApps, pending: pendingApps, offered: offeredApps },
    recommended,
    recentApps,
    notifications
  });
});

// GET /student/profile
router.get('/profile', csrfProtection, (req, res) => {
  const db = getDb();
  let student = getStudent(db, req.session.user.id);
  if (!student) {
    student = { user_id: req.session.user.id, name: '', branch: '', cgpa: 0, grad_year: new Date().getFullYear(), resume_url: '' };
  }
  
  res.render('student/profile', {
    title: 'My Profile',
    csrfToken: req.csrfToken(),
    student,
    branches: config.branches
  });
});

// POST /student/profile
router.post('/profile', csrfProtection, [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('branch').isIn(config.branches).withMessage('Please select a valid branch.'),
  body('cgpa').isFloat({ min: 0, max: 10 }).withMessage('CGPA must be a number between 0 and 10.'),
  body('grad_year').isInt({ min: 2000, max: 2100 }).withMessage('Valid graduation year is required.'),
  body('resume_url').optional({ checkFalsy: true }).isURL().withMessage('Please provide a valid resume URL.'),
  handleValidationErrors('student/profile')
], (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  const { name, branch, cgpa, grad_year, resume_url } = req.body;
  
  const existing = getStudent(db, userId);
  if (existing) {
    db.prepare(`
      UPDATE student_profiles 
      SET name = ?, branch = ?, cgpa = ?, grad_year = ?, resume_url = ?
      WHERE user_id = ?
    `).run(name, branch, parseFloat(cgpa), parseInt(grad_year, 10), resume_url || '', userId);
  } else {
    db.prepare(`
      INSERT INTO student_profiles (user_id, name, branch, cgpa, grad_year, resume_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name, branch, parseFloat(cgpa), parseInt(grad_year, 10), resume_url || '');
  }
  
  req.flash('success', 'Profile updated successfully.');
  res.redirect('/student/profile');
});

// GET /student/postings
router.get('/postings', csrfProtection, (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  let student = getStudent(db, userId);
  if (!student) {
    student = { user_id: userId, name: '', branch: '', cgpa: 0, grad_year: 0, resume_url: '' };
  }

  const { search, branch, type } = req.query;
  
  let query = `
    SELECT jp.*, c.name AS company_name 
    FROM job_postings jp 
    JOIN companies c ON jp.company_id = c.id 
    WHERE jp.status = 'approved' AND c.status = 'approved' AND jp.deadline >= date('now')
  `;
  const params = [];
  
  if (search) {
    query += ` AND (jp.title LIKE ? OR c.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (type) {
    query += ` AND jp.type = ?`;
    params.push(type);
  }
  
  query += ` ORDER BY jp.deadline ASC`;
  let postings = db.prepare(query).all(...params);
  
  postings = postings.map(p => {
    const branches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?').all(p.id).map(b => b.branch);
    p.allowed_branches = branches;
    const eligibility = checkEligibility(student, p, branches);
    const match = calculateMatchScore(student, p, branches);
    p.eligible = eligibility.eligible;
    p.match_score = match.score;
    return p;
  });

  if (branch) {
    postings = postings.filter(p => p.allowed_branches.length === 0 || p.allowed_branches.includes(branch));
  }

  res.render('student/postings', {
    title: 'Browse Postings',
    csrfToken: req.csrfToken(),
    postings,
    branches: config.branches,
    filters: { search, branch, type }
  });
});

// GET /student/postings/:id
router.get('/postings/:id', csrfProtection, (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  let student = getStudent(db, userId);
  if (!student) {
    student = { user_id: userId, name: '', branch: '', cgpa: 0, grad_year: 0, resume_url: '' };
  }

  const posting = db.prepare(`
    SELECT jp.*, c.name AS company_name 
    FROM job_postings jp 
    JOIN companies c ON jp.company_id = c.id 
    WHERE jp.id = ? AND jp.status = 'approved' AND c.status = 'approved'
  `).get(req.params.id);

  if (!posting) {
    req.flash('error', 'Posting not found or no longer active.');
    return res.redirect('/student/postings');
  }

  const branches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?').all(posting.id).map(b => b.branch);
  posting.allowed_branches = branches;

  const eligibility = checkEligibility(student, posting, branches);
  const match = calculateMatchScore(student, posting, branches);
  
  const existingApp = db.prepare('SELECT * FROM applications WHERE student_id = ? AND posting_id = ?').get(userId, posting.id);

  res.render('student/posting-detail', {
    title: posting.title,
    csrfToken: req.csrfToken(),
    posting,
    eligibility,
    match,
    existingApp,
    branches: config.branches
  });
});

// POST /student/postings/:id/apply (Server-side eligibility gating)
router.post('/postings/:id/apply', csrfProtection, (req, res) => {
  const userId = req.session.user.id;
  const postingId = parseInt(req.params.id, 10);

  const gate = canApply(userId, postingId);
  if (!gate.allowed) {
    req.flash('error', gate.reasons.join(' '));
    return res.redirect(`/student/postings/${postingId}`);
  }

  const db = getDb();
  try {
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO applications (student_id, posting_id, status)
        VALUES (?, ?, 'applied')
      `).run(userId, postingId);

      const appId = result.lastInsertRowid;
      db.prepare(`
        INSERT INTO application_history (application_id, from_status, to_status, changed_by, note)
        VALUES (?, NULL, 'applied', ?, 'Application submitted by student')
      `).run(appId, userId);

      return appId;
    });

    const newAppId = txn();
    req.flash('success', 'Application submitted successfully!');
    res.redirect(`/student/applications/${newAppId}`);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      req.flash('error', 'You have already applied to this posting.');
    } else {
      console.error('Apply error:', err);
      req.flash('error', 'Failed to submit application. Please try again.');
    }
    res.redirect(`/student/postings/${postingId}`);
  }
});

// GET /student/applications
router.get('/applications', csrfProtection, (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;

  const applications = db.prepare(`
    SELECT a.*, jp.title, jp.deadline, c.name as company_name 
    FROM applications a
    JOIN job_postings jp ON a.posting_id = jp.id
    JOIN companies c ON jp.company_id = c.id
    WHERE a.student_id = ?
    ORDER BY a.applied_at DESC
  `).all(userId);

  res.render('student/applications', {
    title: 'My Applications',
    csrfToken: req.csrfToken(),
    applications
  });
});

// GET /student/applications/:id
router.get('/applications/:id', csrfProtection, (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;

  const application = db.prepare(`
    SELECT a.*, jp.title, jp.type, c.name as company_name 
    FROM applications a
    JOIN job_postings jp ON a.posting_id = jp.id
    JOIN companies c ON jp.company_id = c.id
    WHERE a.id = ? AND a.student_id = ?
  `).get(req.params.id, userId);

  if (!application) {
    req.flash('error', 'Application not found.');
    return res.redirect('/student/applications');
  }

  const history = getApplicationHistory(application.id);

  res.render('student/application-detail', {
    title: 'Application Details',
    csrfToken: req.csrfToken(),
    application,
    history
  });
});

// POST /student/what-if/:postingId (USP: What-if checker)
router.post('/what-if/:postingId', csrfProtection, (req, res) => {
  const postingId = parseInt(req.params.postingId, 10);
  const { cgpa, branch, grad_year } = req.body;

  const hypotheticalStudent = {
    name: 'Hypothetical Candidate',
    cgpa: parseFloat(cgpa) || 0,
    branch: branch || '',
    grad_year: parseInt(grad_year, 10) || 0,
  };

  const result = whatIf(hypotheticalStudent, postingId);

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json(result);
  }

  if (result.eligible) {
    req.flash('success', 'With these credentials, you WOULD be eligible for this posting!');
  } else {
    req.flash('error', 'Hypothetical check: Ineligible — ' + result.reasons.join(' '));
  }
  res.redirect(`/student/postings/${postingId}`);
});

// POST /student/notifications/read-all
router.post('/notifications/read-all', csrfProtection, (req, res) => {
  markAllAsRead(req.session.user.id);
  req.flash('success', 'All notifications marked as read.');
  res.redirect('/student/dashboard');
});

module.exports = router;
