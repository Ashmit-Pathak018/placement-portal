/**
 * Unit tests for permission and role middleware
 */
const requireRole = require('../src/middleware/requireRole');

describe('requireRole middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      session: {},
      flash: jest.fn(),
    };
    res = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      render: jest.fn(),
    };
    next = jest.fn();
  });

  test('redirects to /login if user is not in session', () => {
    const middleware = requireRole('admin');
    middleware(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(req.flash).toHaveBeenCalledWith('error', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 forbidden if user role does not match required role', () => {
    req.session.user = { id: 1, role: 'student' };
    const middleware = requireRole('admin');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('errors/403', expect.any(Object));
    expect(next).not.toHaveBeenCalled();
  });

  test('allows access if user has one of allowed roles', () => {
    req.session.user = { id: 2, role: 'admin' };
    const middleware = requireRole('admin');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('supports multiple allowed roles', () => {
    req.session.user = { id: 3, role: 'recruiter' };
    const middleware = requireRole('student', 'recruiter');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
