const { body, param, query, validationResult } = require('express-validator');

/**
 * Process validation results — works both as standard middleware (req, res, next)
 * or as a factory returning middleware handleValidationErrors(redirectPath).
 */
function handleValidationErrors(redirectPathOrReq, res, next) {
  if (typeof redirectPathOrReq === 'string') {
    const redirectPath = redirectPathOrReq;
    return (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg);
        req.flash('error', messages.join(' '));
        return res.redirect(redirectPath.startsWith('/') ? redirectPath : '/' + redirectPath);
      }
      next();
    };
  }

  // Normal middleware usage: (req, res, next)
  const req = redirectPathOrReq;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => e.msg);
    req.flash('error', messages.join(' '));
    return res.redirect('back');
  }
  next();
}

// Re-export express-validator helpers for convenience
module.exports = {
  body,
  param,
  query,
  validationResult,
  handleValidationErrors,
};
