const Guest = require('../models/Guest');

/**
 * Middleware: read X-Session-ID header, load the guest from DB.
 * Attaches req.guest if found. Does NOT block unauthenticated requests.
 */
exports.loadGuest = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    try {
      const guest = await Guest.findOne({ sessionId }).populate('squad', 'name role basePrice soldPrice country image');
      if (guest) {
        req.guest = guest;
        // Touch lastSeen (fire-and-forget)
        Guest.findByIdAndUpdate(guest._id, { lastSeen: new Date() }).exec();
      }
    } catch (_) { /* ignore */ }
  }
  next();
};

/**
 * Middleware: require a valid guest session.
 */
exports.requireGuest = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(401).json({ success: false, message: 'Session ID required (X-Session-ID header)' });
  }
  try {
    const guest = await Guest.findOne({ sessionId }).populate('squad', 'name role basePrice soldPrice country image');
    if (!guest) {
      return res.status(401).json({ success: false, message: 'Session not found. Please re-enter your team name.' });
    }
    req.guest = guest;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Middleware: require admin role (guest.role === 'admin').
 */
exports.requireAdmin = (req, res, next) => {
  if (!req.guest || req.guest.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};
