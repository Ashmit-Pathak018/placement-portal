const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const csrfProtection = require('../middleware/csrf');
const { body, handleValidationErrors } = require('../middleware/validate');
const config = require('../config');

// GET /register
router.get('/register', csrfProtection, (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register', { title: 'Register', csrfToken: req.csrfToken(), branches: config.branches });
});

// POST /register
router.post('/register', csrfProtection, [
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  body('role').isIn(['student', 'recruiter']).withMessage('Role must be student or recruiter.'),
], handleValidationErrors, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const db = getDb();

    // Check for duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      req.flash('error', 'An account with this email already exists.');
      return res.redirect('/register');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(email, passwordHash, role);

    // If student, create an empty profile
    if (role === 'student') {
      db.prepare('INSERT INTO student_profiles (user_id) VALUES (?)').run(result.lastInsertRowid);
    }

    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', 'Registration failed. Please try again.');
    res.redirect('/register');
  }
});

// GET /login
router.get('/login', csrfProtection, (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Login', csrfToken: req.csrfToken() });
});

// POST /login
router.post('/login', csrfProtection, [
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
], handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    // Store user in session (no password hash)
    req.session.user = { id: user.id, email: user.email, role: user.role };

    // Redirect based on role
    switch (user.role) {
      case 'admin': return res.redirect('/admin/dashboard');
      case 'recruiter': return res.redirect('/recruiter/company');
      case 'student': return res.redirect('/student/dashboard');
      default: return res.redirect('/');
    }
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Login failed. Please try again.');
    res.redirect('/login');
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
