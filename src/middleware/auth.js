const config = require('../config');

// Middleware: require authentication - redirects to /login if not logged in
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  if (req.session.username !== config.adminUsername) {
    return res.status(403).send('Forbidden');
  }
  next();
}

// Middleware: make user data available to all EJS templates via res.locals
function addUserToLocals(req, res, next) {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    isAdmin: req.session.username === config.adminUsername
  } : null;
  next();
}

module.exports = { requireAuth, requireAdmin, addUserToLocals };
