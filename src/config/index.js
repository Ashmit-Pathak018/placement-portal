require('dotenv').config();
const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'fallback-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'placement.db'),

  // Application constants
  roles: ['student', 'recruiter', 'admin'],
  branches: ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'CHE', 'BT'],

  applicationStatuses: ['applied', 'under_review', 'shortlisted', 'interview', 'offered', 'rejected'],

  allowedTransitions: {
    applied:       ['under_review', 'rejected'],
    under_review:  ['shortlisted', 'rejected'],
    shortlisted:   ['interview', 'rejected'],
    interview:     ['offered', 'rejected'],
    offered:       [],   // final
    rejected:      [],   // final
  },

  companyStatuses: ['pending', 'approved', 'rejected'],
  postingStatuses: ['pending', 'approved', 'rejected', 'closed'],
};
