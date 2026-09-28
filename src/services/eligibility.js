/**
 * Eligibility service — determines if a student can apply to a posting
 * and returns human-readable reasons for any failure.
 */
const { getDb } = require('../db');

/**
 * Core eligibility check: student profile vs posting requirements.
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
function checkEligibility(student, posting, allowedBranches) {
  const reasons = [];

  if (!student.name || !student.branch || !student.cgpa || !student.grad_year) {
    reasons.push('Your profile is incomplete. Please fill in all fields before applying.');
  }

  if (student.cgpa < posting.min_cgpa) {
    reasons.push(`Your CGPA (${student.cgpa}) is below the minimum requirement (${posting.min_cgpa}).`);
  }

  if (allowedBranches.length > 0 && !allowedBranches.includes(student.branch)) {
    reasons.push(`Your branch (${student.branch}) is not eligible for this role. Eligible branches: ${allowedBranches.join(', ')}.`);
  }

  if (posting.grad_year && student.grad_year !== posting.grad_year) {
    reasons.push(`This role is for the ${posting.grad_year} batch, but you are in the ${student.grad_year} batch.`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Full apply-gate: checks eligibility + posting/company status + deadline + duplicates.
 * @returns {{ allowed: boolean, reasons: string[] }}
 */
function canApply(studentUserId, postingId) {
  const db = getDb();

  // Fetch student profile
  const student = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(studentUserId);
  if (!student) {
    return { allowed: false, reasons: ['Student profile not found. Please complete your profile first.'] };
  }

  // Fetch posting with company
  const posting = db.prepare(`
    SELECT jp.*, c.status AS company_status
    FROM job_postings jp
    JOIN companies c ON jp.company_id = c.id
    WHERE jp.id = ?
  `).get(postingId);

  if (!posting) {
    return { allowed: false, reasons: ['Posting not found.'] };
  }

  const reasons = [];

  // Company must be approved
  if (posting.company_status !== 'approved') {
    reasons.push('The company for this posting has not been approved yet.');
  }

  // Posting must be approved
  if (posting.status !== 'approved') {
    reasons.push('This posting is not currently accepting applications.');
  }

  // Check deadline
  if (posting.deadline && new Date(posting.deadline) < new Date()) {
    reasons.push('The application deadline has passed.');
  }

  // Check for duplicate application
  const existing = db.prepare('SELECT id FROM applications WHERE posting_id = ? AND student_id = ?')
    .get(postingId, studentUserId);
  if (existing) {
    reasons.push('You have already applied to this posting.');
  }

  // Eligibility checks
  const allowedBranches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?')
    .all(postingId)
    .map(r => r.branch);

  const eligibility = checkEligibility(student, posting, allowedBranches);
  reasons.push(...eligibility.reasons);

  return { allowed: reasons.length === 0, reasons };
}

/**
 * What-if checker: simulates eligibility with hypothetical student values.
 */
function whatIf(hypotheticalStudent, postingId) {
  const db = getDb();
  const posting = db.prepare('SELECT * FROM job_postings WHERE id = ?').get(postingId);
  if (!posting) return { eligible: false, reasons: ['Posting not found.'] };

  const allowedBranches = db.prepare('SELECT branch FROM posting_departments WHERE posting_id = ?')
    .all(postingId)
    .map(r => r.branch);

  return checkEligibility(hypotheticalStudent, posting, allowedBranches);
}

module.exports = { checkEligibility, canApply, whatIf };
