require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');

const config = require('./config');
const { getDb } = require('./db');

// Initialise database on startup
const fs = require('fs');
const schemaPath = path.join(__dirname, 'db', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  getDb().exec(schema);
}

const app = express();

// ---------- Security ----------
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts for EJS & CDN
}));

// ---------- Body parsing ----------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---------- Static files ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Sessions ----------
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ---------- Flash messages ----------
app.use(flash());

// ---------- Globals for views ----------
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path || '';
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
  };
  res.locals.csrfToken = ''; // will be overridden per-route with CSRF middleware
  next();
});

// ---------- Routes ----------
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const recruiterRoutes = require('./routes/recruiter');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/recruiter', recruiterRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Home redirect
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  switch (req.session.user.role) {
    case 'admin': return res.redirect('/admin/dashboard');
    case 'recruiter': return res.redirect('/recruiter/company');
    case 'student': return res.redirect('/student/dashboard');
    default: return res.redirect('/login');
  }
});

// ---------- Error handling ----------
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    req.flash('error', 'Invalid or expired form submission. Please try again.');
    return res.redirect('back');
  }
  console.error('Unhandled error:', err);
  res.status(500).render('errors/404', { title: 'Server Error' });
});

// ---------- Start ----------
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 CampusPlace running at http://localhost:${PORT}`);
});

module.exports = app;
