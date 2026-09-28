const csrf = require('csurf');

// CSRF protection using session-based tokens
const csrfProtection = csrf();

module.exports = csrfProtection;
