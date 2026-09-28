/**
 * Authentication middleware — checks if user is logged in.
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/login');
}

module.exports = { isAuthenticated };
