/**
 * Tests for eligibility service, application transitions, and batch logic.
 */

// --- Eligibility tests (pure function, no DB needed) ---
const { checkEligibility } = require('../src/services/eligibility');

describe('checkEligibility', () => {
  const baseStudent = { name: 'Test', branch: 'CSE', cgpa: 8.5, grad_year: 2026 };
  const basePosting = { min_cgpa: 7.0, grad_year: 2026 };
  const allBranches = ['CSE', 'ECE', 'IT'];

  test('eligible student passes all checks', () => {
    const result = checkEligibility(baseStudent, basePosting, allBranches);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  test('CGPA below minimum returns reason', () => {
    const student = { ...baseStudent, cgpa: 6.0 };
    const result = checkEligibility(student, basePosting, allBranches);
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    expect(result.reasons[0]).toContain('CGPA');
    expect(result.reasons[0]).toContain('6');
  });

  test('wrong branch returns reason', () => {
    const student = { ...baseStudent, branch: 'ME' };
    const result = checkEligibility(student, basePosting, allBranches);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('ME'))).toBe(true);
  });

  test('wrong grad year returns reason', () => {
    const student = { ...baseStudent, grad_year: 2025 };
    const result = checkEligibility(student, basePosting, allBranches);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('2026'))).toBe(true);
  });

  test('multiple failures returns all reasons', () => {
    const student = { ...baseStudent, cgpa: 5.0, branch: 'ME', grad_year: 2025 };
    const result = checkEligibility(student, basePosting, allBranches);
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBe(3);
  });

  test('empty branches list means all eligible', () => {
    const student = { ...baseStudent, branch: 'CHE' };
    const result = checkEligibility(student, basePosting, []);
    expect(result.eligible).toBe(true);
  });

  test('null grad_year on posting means any year is fine', () => {
    const posting = { ...basePosting, grad_year: null };
    const student = { ...baseStudent, grad_year: 2030 };
    const result = checkEligibility(student, posting, allBranches);
    expect(result.eligible).toBe(true);
  });

  test('incomplete profile is caught', () => {
    const student = { name: '', branch: '', cgpa: 0, grad_year: 0 };
    const result = checkEligibility(student, basePosting, []);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.includes('incomplete'))).toBe(true);
  });
});


// --- Allowed transitions tests (pure logic) ---
const config = require('../src/config');

describe('Status transition rules', () => {
  test('applied can go to under_review or rejected', () => {
    expect(config.allowedTransitions.applied).toEqual(['under_review', 'rejected']);
  });

  test('under_review can go to shortlisted or rejected', () => {
    expect(config.allowedTransitions.under_review).toEqual(['shortlisted', 'rejected']);
  });

  test('shortlisted can go to interview or rejected', () => {
    expect(config.allowedTransitions.shortlisted).toEqual(['interview', 'rejected']);
  });

  test('interview can go to offered or rejected', () => {
    expect(config.allowedTransitions.interview).toEqual(['offered', 'rejected']);
  });

  test('offered is final (no transitions)', () => {
    expect(config.allowedTransitions.offered).toEqual([]);
  });

  test('rejected is final (no transitions)', () => {
    expect(config.allowedTransitions.rejected).toEqual([]);
  });

  test('invalid transition is not allowed', () => {
    // applied cannot skip to offered
    expect(config.allowedTransitions.applied).not.toContain('offered');
    // applied cannot skip to interview
    expect(config.allowedTransitions.applied).not.toContain('interview');
  });
});


// --- Match score tests ---
const { calculateMatchScore } = require('../src/services/matchScore');

describe('calculateMatchScore', () => {
  const student = { name: 'Test', branch: 'CSE', cgpa: 9.0, grad_year: 2026 };

  test('perfect match gives high score', () => {
    const posting = { min_cgpa: 7.0, grad_year: 2026, deadline: new Date(Date.now() + 2 * 86400000).toISOString() };
    const result = calculateMatchScore(student, posting, ['CSE']);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.breakdown.length).toBeGreaterThanOrEqual(3);
  });

  test('branch mismatch gives 0 for branch component', () => {
    const posting = { min_cgpa: 7.0, grad_year: 2026, deadline: new Date(Date.now() + 30 * 86400000).toISOString() };
    const result = calculateMatchScore(student, posting, ['ECE', 'ME']);
    const branchItem = result.breakdown.find(b => b.label === 'Branch match');
    expect(branchItem.points).toBe(0);
  });

  test('CGPA margin is capped at 30', () => {
    const highStudent = { ...student, cgpa: 10.0 };
    const posting = { min_cgpa: 5.0, grad_year: 2026, deadline: new Date(Date.now() + 30 * 86400000).toISOString() };
    const result = calculateMatchScore(highStudent, posting, ['CSE']);
    const cgpaItem = result.breakdown.find(b => b.label === 'CGPA margin');
    expect(cgpaItem.points).toBeLessThanOrEqual(30);
  });

  test('urgency bonus increases as deadline approaches', () => {
    const nearDeadline = { min_cgpa: 7.0, grad_year: 2026, deadline: new Date(Date.now() + 1 * 86400000).toISOString() };
    const farDeadline = { min_cgpa: 7.0, grad_year: 2026, deadline: new Date(Date.now() + 30 * 86400000).toISOString() };

    const nearResult = calculateMatchScore(student, nearDeadline, ['CSE']);
    const farResult = calculateMatchScore(student, farDeadline, ['CSE']);

    const nearUrgency = nearResult.breakdown.find(b => b.label === 'Urgency');
    const farUrgency = farResult.breakdown.find(b => b.label === 'Urgency');

    expect(nearUrgency.points).toBeGreaterThan(farUrgency.points);
  });

  test('breakdown items have label, points, and detail', () => {
    const posting = { min_cgpa: 7.0, grad_year: 2026, deadline: new Date(Date.now() + 7 * 86400000).toISOString() };
    const result = calculateMatchScore(student, posting, ['CSE']);
    result.breakdown.forEach(item => {
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('points');
      expect(item).toHaveProperty('detail');
    });
  });
});
