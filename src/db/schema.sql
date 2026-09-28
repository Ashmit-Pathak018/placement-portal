-- placement-portal schema

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  password_hash TEXT  NOT NULL,
  role        TEXT    NOT NULL CHECK(role IN ('student','recruiter','admin')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  name        TEXT    NOT NULL DEFAULT '',
  branch      TEXT    NOT NULL DEFAULT '',
  cgpa        REAL    NOT NULL DEFAULT 0.0,
  grad_year   INTEGER NOT NULL DEFAULT 0,
  resume_url  TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES users(id),
  name        TEXT    NOT NULL,
  website     TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_postings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  type        TEXT    NOT NULL DEFAULT 'job' CHECK(type IN ('job','internship')),
  min_cgpa    REAL    NOT NULL DEFAULT 0.0,
  grad_year   INTEGER,
  deadline    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','closed')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posting_departments (
  posting_id  INTEGER NOT NULL REFERENCES job_postings(id),
  branch      TEXT    NOT NULL,
  PRIMARY KEY (posting_id, branch)
);

CREATE TABLE IF NOT EXISTS applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  posting_id  INTEGER NOT NULL REFERENCES job_postings(id),
  student_id  INTEGER NOT NULL REFERENCES users(id),
  status      TEXT    NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','under_review','shortlisted','interview','offered','rejected')),
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(posting_id, student_id)
);

CREATE TABLE IF NOT EXISTS application_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER NOT NULL REFERENCES applications(id),
  from_status     TEXT,
  to_status       TEXT    NOT NULL,
  changed_by      INTEGER NOT NULL REFERENCES users(id),
  changed_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  note            TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL REFERENCES users(id),
  entity_type TEXT    NOT NULL CHECK(entity_type IN ('company','posting')),
  entity_id   INTEGER NOT NULL,
  action      TEXT    NOT NULL CHECK(action IN ('approved','rejected')),
  reason      TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  message     TEXT    NOT NULL,
  link        TEXT    NOT NULL DEFAULT '',
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_applications_posting  ON applications(posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_student  ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status   ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_companies_status      ON companies(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON admin_audit_logs(entity_type, entity_id);
