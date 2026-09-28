/**
 * Role-checking middleware factory.
 * Usage: requireRole('admin') or requireRole('student', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('errors/403', {
        title: 'Forbidden',
        message: 'You do not have permission to access this page.',
      });
    }
    return next();
  };
}

module.exports = requireRole;
