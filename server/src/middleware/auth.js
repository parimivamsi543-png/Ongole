const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Short-TTL in-memory cache to eliminate redundant Atlas auth roundtrips across parallel page loads
const USER_CACHE_TTL_MS = 15000;
const userCache = new Map();

const findUserWithRetry = async (userId) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await User.findById(userId).select('_id fullName email role isActive').lean();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Authentication token is required to access this resource.',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'super_secret_jwt_ledgerline_production_key_2026_secure'
    );
  } catch (jwtErr) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token is invalid or expired.',
      details: jwtErr.message,
    });
  }

  try {
    const cacheKey = decoded.id;
    const cached = userCache.get(cacheKey);
    let user;

    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    } else {
      user = await findUserWithRetry(cacheKey);
      if (user) {
        userCache.set(cacheKey, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
      }
    }

    if (!user || !user.isActive) {
      userCache.delete(cacheKey);
      return res.status(401).json({
        success: false,
        error: 'USER_DEACTIVATED',
        message: 'Session no longer matches an active user (please sign in again).',
      });
    }

    req.user = user;
    next();
  } catch (dbErr) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_TEMPORARILY_UNAVAILABLE',
      message: 'Temporary database connectivity issue while verifying session. Please retry.',
      details: dbErr.message,
    });
  }
};

module.exports = { authenticateToken };
