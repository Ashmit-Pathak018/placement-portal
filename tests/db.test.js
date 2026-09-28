/**
 * Integration tests for DB schema and constraints
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('Database Schema & Constraints', () => {
  let db;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(schema);
  });

  afterAll(() => {
    if (db) db.close();
  });

  test('Database tables are properly initialized in schema', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    expect(tables).toContain('users');
    expect(tables).toContain('student_profiles');
    expect(tables).toContain('companies');
    expect(tables).toContain('job_postings');
    expect(tables).toContain('posting_departments');
    expect(tables).toContain('applications');
    expect(tables).toContain('application_history');
    expect(tables).toContain('admin_audit_logs');
    expect(tables).toContain('notifications');
  });

  test('UNIQUE constraint on (posting_id, student_id) in applications blocks duplicates', () => {
    db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (101, 's@c.edu', 'hash', 'student')").run();
    db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (102, 'r@c.edu', 'hash', 'recruiter')").run();
    db.prepare("INSERT INTO companies (id, recruiter_id, name, status) VALUES (101, 102, 'Test Co', 'approved')").run();
    db.prepare("INSERT INTO job_postings (id, company_id, title, deadline, status) VALUES (101, 101, 'Dev', '2026-12-31', 'approved')").run();

    // First application succeeds
    db.prepare("INSERT INTO applications (posting_id, student_id, status) VALUES (101, 101, 'applied')").run();

    // Duplicate application with same student and posting fails
    expect(() => {
      db.prepare("INSERT INTO applications (posting_id, student_id, status) VALUES (101, 101, 'applied')").run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  test('Check constraints enforce valid roles and statuses', () => {
    expect(() => {
      db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('invalid@c.edu', 'hash', 'superman')").run();
    }).toThrow(/CHECK constraint failed/);

    expect(() => {
      db.prepare("INSERT INTO companies (recruiter_id, name, status) VALUES (102, 'Bad Co', 'fake_status')").run();
    }).toThrow(/CHECK constraint failed/);
  });
});
