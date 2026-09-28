/**
 * Match Score service — rule-based transparent scoring.
 *
 * score = 40 (branch match, required)
 *       + min(30, (cgpa - min_cgpa) * 10)   // margin above cutoff
 *       + 15 (grad year matches or unspecified)
 *       + urgency bonus (up to 15) as deadline approaches
 */

function calculateMatchScore(student, posting, allowedBranches = []) {
  const breakdown = [];
  let score = 0;

  // Branch match (required baseline — 40 pts)
  if (!allowedBranches || allowedBranches.length === 0 || allowedBranches.includes(student.branch)) {
    score += 40;
    breakdown.push({ label: 'Branch match', points: 40, detail: `Your branch (${student.branch}) is eligible.` });
  } else {
    breakdown.push({ label: 'Branch match', points: 0, detail: `Your branch (${student.branch}) is not in the eligible list.` });
  }

  // CGPA margin (up to 30 pts)
  const minCgpa = posting.min_cgpa || 0;
  if ((student.cgpa || 0) >= minCgpa) {
    const margin = (student.cgpa || 0) - minCgpa;
    const cgpaPoints = Math.min(30, Math.round(margin * 10));
    score += cgpaPoints;
    breakdown.push({ label: 'CGPA margin', points: cgpaPoints, detail: `Your CGPA (${student.cgpa}) is ${margin.toFixed(1)} above the minimum (${minCgpa}).` });
  } else {
    breakdown.push({ label: 'CGPA margin', points: 0, detail: `Your CGPA (${student.cgpa}) is below the minimum (${minCgpa}).` });
  }

  // Grad year (15 pts)
  if (!posting.grad_year || student.grad_year === posting.grad_year) {
    score += 15;
    const detail = posting.grad_year
      ? `Your graduation year (${student.grad_year}) matches the requirement.`
      : 'No specific graduation year required.';
    breakdown.push({ label: 'Grad year', points: 15, detail });
  } else {
    breakdown.push({ label: 'Grad year', points: 0, detail: `This role targets the ${posting.grad_year} batch.` });
  }

  // Urgency bonus (up to 15 pts — more points as deadline gets closer)
  if (posting.deadline) {
    const now = new Date();
    const deadline = new Date(posting.deadline);
    const daysLeft = (deadline - now) / (1000 * 60 * 60 * 24);

    let urgencyPoints = 0;
    if (daysLeft < 0) {
      urgencyPoints = 0;
    } else if (daysLeft <= 3) {
      urgencyPoints = 15;
    } else if (daysLeft <= 7) {
      urgencyPoints = 10;
    } else if (daysLeft <= 14) {
      urgencyPoints = 5;
    }

    score += urgencyPoints;
    breakdown.push({
      label: 'Urgency',
      points: urgencyPoints,
      detail: daysLeft < 0
        ? 'Deadline has passed.'
        : `${Math.ceil(Math.max(0, daysLeft))} day(s) remaining before deadline.`,
    });
  }

  return { score, total: score, maxScore: 100, percentage: score, breakdown };
}

module.exports = { calculateMatchScore };
