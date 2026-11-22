const jwt = require('jsonwebtoken');
const prisma = require('../db');

/**
 * The current user is re-read from the database so a deactivated user loses access, but not on EVERY request:
 * a small in-memory cache (15 s) removes one database round trip from nearly every call.
 * Whenever a user is changed or deactivated the API calls `auth.invalidateUser(id)`, so within this server process
 * the change is effective immediately; other processes (if you run several) see it within the TTL.
 */
const TTL_MS = 15 * 1000;
const MAX_CACHED = 500;
const cache = new Map(); // id -> { user, at }

const invalidateUser = (id) => cache.delete(id);

async function loadUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, ownerId: true, isActive: true },
  });
  if (user) {
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(id, { user, at: Date.now() });
  } else {
    cache.delete(id);
  }
  return user;
}

/**
 * JWT authentication middleware.
 * Verifies the Bearer token and loads the current user.
 */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await loadUser(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

auth.invalidateUser = invalidateUser;
module.exports = auth;
