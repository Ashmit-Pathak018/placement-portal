/**
 * Seed script — populates the database with realistic test data.
 * Usage:
 *   npm run seed         — seeds (skips if data exists)
 *   npm run seed:reset   — drops all data and re-seeds
 */
const path = require('path');
const bcrypt = require('bcrypt');
const { getDb, closeDb } = require('./index');

const RESET = process.argv.includes('--reset');

async function seed() {
  // Ensure schema is applied first
  const fs = require('fs');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const db = getDb();
  db.exec(schema);

  if (RESET) {
    console.log('🗑  Resetting database...');
    db.exec(`
      DELETE FROM notifications;
      DELETE FROM admin_audit_logs;
      DELETE FROM application_history;
      DELETE FROM applications;
      DELETE FROM posting_departments;
      DELETE FROM job_postings;
      DELETE FROM companies;
      DELETE FROM student_profiles;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);
  }

  // Check if already seeded
  const existingUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (existingUsers.count > 0 && !RESET) {
    console.log('ℹ  Database already has data. Use --reset to re-seed.');
    return;
  }

  console.log('🌱 Seeding database...');

  const SALT = 10;

  // ============== USERS ==============
  const adminHash = await bcrypt.hash('Admin@123', SALT);
  const recruiterHash = await bcrypt.hash('Recruit@123', SALT);
  const studentHash = await bcrypt.hash('Student@123', SALT);

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');

  const admin = insertUser.run('admin@campus.edu', adminHash, 'admin');
  const recruiter1 = insertUser.run('recruiter1@acme.com', recruiterHash, 'recruiter');
  const recruiter2 = insertUser.run('recruiter2@globex.com', recruiterHash, 'recruiter');
  const student1 = insertUser.run('student1@campus.edu', studentHash, 'student');
  const student2 = insertUser.run('student2@campus.edu', studentHash, 'student');
  const student3 = insertUser.run('student3@campus.edu', studentHash, 'student');

  const adminId = admin.lastInsertRowid;
  const r1Id = recruiter1.lastInsertRowid;
  const r2Id = recruiter2.lastInsertRowid;
  const s1Id = student1.lastInsertRowid;
  const s2Id = student2.lastInsertRowid;
  const s3Id = student3.lastInsertRowid;

  // ============== STUDENT PROFILES ==============
  const insertProfile = db.prepare(
    'INSERT INTO student_profiles (user_id, name, branch, cgpa, grad_year, resume_url) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertProfile.run(s1Id, 'Aarav Sharma', 'CSE', 9.1, 2026, 'https://example.com/resume/aarav.pdf');
  insertProfile.run(s2Id, 'Priya Patel', 'ECE', 6.5, 2026, 'https://example.com/resume/priya.pdf');
  insertProfile.run(s3Id, 'Rohan Kumar', 'CSE', 8.0, 2025, 'https://example.com/resume/rohan.pdf');

  // ============== COMPANIES ==============
  const insertCompany = db.prepare(
    `INSERT INTO companies (recruiter_id, name, website, description, status, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const acme = insertCompany.run(
    r1Id, 'Acme Technologies', 'https://acme.tech',
    'Acme Technologies is a leading software company specializing in cloud solutions and AI platforms. We build products used by millions.',
    'approved', adminId, '2026-09-01 10:00:00'
  );

  const globex = insertCompany.run(
    r2Id, 'Globex Corporation', 'https://globex.com',
    'Globex Corporation is an innovative firm in the IoT and embedded systems space.',
    'pending', null, null
  );

  // Add a rejected company for completeness
  const insertRejectedCompany = db.prepare(
    `INSERT INTO companies (recruiter_id, name, website, description, status, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, 'rejected', ?, datetime('now'))`
  );
  // (We'll skip this for simplicity — recruiter2 has the pending company)

  const acmeId = acme.lastInsertRowid;
  const globexId = globex.lastInsertRowid;

  // ============== JOB POSTINGS ==============
  const insertPosting = db.prepare(
    `INSERT INTO job_postings (company_id, title, description, type, min_cgpa, grad_year, deadline, status, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const posting1 = insertPosting.run(
    acmeId, 'Software Engineer', 
    'Join our engineering team to build next-gen cloud platforms. Work with React, Node.js, and AWS. Competitive salary and stock options.',
    'job', 7.5, 2026, '2026-12-31', 'approved', adminId, '2026-09-02 10:00:00'
  );

  const posting2 = insertPosting.run(
    acmeId, 'Data Science Intern',
    'Summer internship program for data science. Work on real ML models, NLP pipelines, and data analytics dashboards.',
    'internship', 8.0, 2026, '2026-11-15', 'approved', adminId, '2026-09-02 11:00:00'
  );

  const posting3 = insertPosting.run(
    acmeId, 'DevOps Engineer',
    'Manage CI/CD pipelines, Kubernetes clusters, and cloud infrastructure. Experience with Docker and Terraform preferred.',
    'job', 7.0, null, '2026-12-15', 'pending', null, null
  );

  const posting4 = insertPosting.run(
    acmeId, 'Frontend Developer Intern',
    'Build beautiful, accessible web interfaces using React and TypeScript. Great mentorship and learning opportunities.',
    'internship', 6.0, 2026, '2026-10-31', 'approved', adminId, '2026-09-05 09:00:00'
  );

  const p1Id = posting1.lastInsertRowid;
  const p2Id = posting2.lastInsertRowid;
  const p3Id = posting3.lastInsertRowid;
  const p4Id = posting4.lastInsertRowid;

  // ============== POSTING DEPARTMENTS ==============
  const insertDept = db.prepare('INSERT INTO posting_departments (posting_id, branch) VALUES (?, ?)');

  // Software Engineer — CSE, IT
  insertDept.run(p1Id, 'CSE');
  insertDept.run(p1Id, 'IT');

  // Data Science Intern — CSE, ECE, IT
  insertDept.run(p2Id, 'CSE');
  insertDept.run(p2Id, 'ECE');
  insertDept.run(p2Id, 'IT');

  // DevOps Engineer — CSE, IT, ECE
  insertDept.run(p3Id, 'CSE');
  insertDept.run(p3Id, 'IT');
  insertDept.run(p3Id, 'ECE');

  // Frontend Developer Intern — all branches (no restriction)
  for (const branch of ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'CHE', 'BT']) {
    insertDept.run(p4Id, branch);
  }

  // ============== APPLICATIONS ==============
  const insertApp = db.prepare(
    `INSERT INTO applications (posting_id, student_id, status, applied_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  // Student 1 (Aarav, CSE, 9.1) — applied to Software Engineer, offered
  const app1 = insertApp.run(p1Id, s1Id, 'offered', '2026-09-10 09:00:00', '2026-09-25 14:00:00');
  // Student 1 — applied to Data Science Intern, shortlisted
  const app2 = insertApp.run(p2Id, s1Id, 'shortlisted', '2026-09-11 10:00:00', '2026-09-20 11:00:00');

  // Student 3 (Rohan, CSE, 8.0) — applied to Software Engineer, under_review
  const app3 = insertApp.run(p1Id, s3Id, 'under_review', '2026-09-12 08:00:00', '2026-09-15 09:00:00');
  // Student 3 — applied to Frontend Dev Intern, interview
  const app4 = insertApp.run(p4Id, s3Id, 'interview', '2026-09-13 11:00:00', '2026-09-22 16:00:00');
  // Student 3 — applied to Data Science Intern, rejected
  const app5 = insertApp.run(p2Id, s3Id, 'rejected', '2026-09-14 09:30:00', '2026-09-18 10:00:00');

  const a1Id = app1.lastInsertRowid;
  const a2Id = app2.lastInsertRowid;
  const a3Id = app3.lastInsertRowid;
  const a4Id = app4.lastInsertRowid;
  const a5Id = app5.lastInsertRowid;

  // ============== APPLICATION HISTORY ==============
  const insertHistory = db.prepare(
    `INSERT INTO application_history (application_id, from_status, to_status, changed_by, changed_at, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  // App1: applied → under_review → shortlisted → interview → offered
  insertHistory.run(a1Id, null, 'applied', s1Id, '2026-09-10 09:00:00', 'Application submitted');
  insertHistory.run(a1Id, 'applied', 'under_review', r1Id, '2026-09-12 10:00:00', 'Resume looks strong');
  insertHistory.run(a1Id, 'under_review', 'shortlisted', r1Id, '2026-09-15 14:00:00', 'Shortlisted for technical round');
  insertHistory.run(a1Id, 'shortlisted', 'interview', r1Id, '2026-09-20 09:00:00', 'Interview scheduled for Sep 23');
  insertHistory.run(a1Id, 'interview', 'offered', r1Id, '2026-09-25 14:00:00', 'Congratulations! Offer letter sent.');

  // App2: applied → under_review → shortlisted
  insertHistory.run(a2Id, null, 'applied', s1Id, '2026-09-11 10:00:00', 'Application submitted');
  insertHistory.run(a2Id, 'applied', 'under_review', r1Id, '2026-09-14 11:00:00', '');
  insertHistory.run(a2Id, 'under_review', 'shortlisted', r1Id, '2026-09-20 11:00:00', 'Strong ML background');

  // App3: applied → under_review
  insertHistory.run(a3Id, null, 'applied', s3Id, '2026-09-12 08:00:00', 'Application submitted');
  insertHistory.run(a3Id, 'applied', 'under_review', r1Id, '2026-09-15 09:00:00', 'Under initial review');

  // App4: applied → under_review → shortlisted → interview
  insertHistory.run(a4Id, null, 'applied', s3Id, '2026-09-13 11:00:00', 'Application submitted');
  insertHistory.run(a4Id, 'applied', 'under_review', r1Id, '2026-09-16 10:00:00', '');
  insertHistory.run(a4Id, 'under_review', 'shortlisted', r1Id, '2026-09-19 15:00:00', 'Good portfolio');
  insertHistory.run(a4Id, 'shortlisted', 'interview', r1Id, '2026-09-22 16:00:00', 'Design challenge scheduled');

  // App5: applied → under_review → rejected
  insertHistory.run(a5Id, null, 'applied', s3Id, '2026-09-14 09:30:00', 'Application submitted');
  insertHistory.run(a5Id, 'applied', 'under_review', r1Id, '2026-09-16 10:30:00', '');
  insertHistory.run(a5Id, 'under_review', 'rejected', r1Id, '2026-09-18 10:00:00', 'Looking for 2026 batch candidates');

  // ============== AUDIT LOGS ==============
  const insertAudit = db.prepare(
    `INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertAudit.run(adminId, 'company', acmeId, 'approved', 'Verified company details and website.', '2026-09-01 10:00:00');
  insertAudit.run(adminId, 'posting', p1Id, 'approved', 'Posting requirements look reasonable.', '2026-09-02 10:00:00');
  insertAudit.run(adminId, 'posting', p2Id, 'approved', 'Good internship opportunity for students.', '2026-09-02 11:00:00');
  insertAudit.run(adminId, 'posting', p4Id, 'approved', 'Open to all branches, great inclusion.', '2026-09-05 09:00:00');

  // ============== NOTIFICATIONS ==============
  const insertNotif = db.prepare(
    `INSERT INTO notifications (user_id, message, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  // Recruiter notifications
  insertNotif.run(r1Id, 'Your company "Acme Technologies" has been approved by the placement cell.', '/recruiter/company', 1, '2026-09-01 10:01:00');
  insertNotif.run(r1Id, 'Your posting "Software Engineer" has been approved and is now live.', '/recruiter/postings', 1, '2026-09-02 10:01:00');
  insertNotif.run(r1Id, 'New application received for "Software Engineer" from Aarav Sharma.', '/recruiter/postings/' + p1Id + '/applicants', 0, '2026-09-10 09:01:00');

  // Student 1 notifications
  insertNotif.run(s1Id, 'Your application for "Software Engineer" at Acme Technologies has been updated to: offered.', '/student/applications/' + a1Id, 0, '2026-09-25 14:01:00');
  insertNotif.run(s1Id, 'Your application for "Data Science Intern" at Acme Technologies has been updated to: shortlisted.', '/student/applications/' + a2Id, 0, '2026-09-20 11:01:00');

  // Student 3 notifications
  insertNotif.run(s3Id, 'Your application for "Data Science Intern" at Acme Technologies has been updated to: rejected.', '/student/applications/' + a5Id, 1, '2026-09-18 10:01:00');
  insertNotif.run(s3Id, 'Your application for "Frontend Developer Intern" at Acme Technologies has been updated to: interview.', '/student/applications/' + a4Id, 0, '2026-09-22 16:01:00');

  console.log('✓ Seed complete!');
  console.log('');
  console.log('Mock Credentials:');
  console.log('  Admin:      admin@campus.edu / Admin@123');
  console.log('  Recruiter1: recruiter1@acme.com / Recruit@123 (Approved company)');
  console.log('  Recruiter2: recruiter2@globex.com / Recruit@123 (Pending company)');
  console.log('  Student1:   student1@campus.edu / Student@123 (CGPA 9.1, CSE)');
  console.log('  Student2:   student2@campus.edu / Student@123 (CGPA 6.5, ECE)');
  console.log('  Student3:   student3@campus.edu / Student@123 (CGPA 8.0, CSE, varied apps)');
}

seed()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
