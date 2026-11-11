const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAudit } = require('../services/auditService');

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'super_secret_jwt_ledgerline_production_key_2026_secure',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      await logAudit({
        actorEmail: email,
        action: 'AUTH_LOGIN',
        targetResource: 'AUTH',
        outcome: 'REFUSED',
        reason: 'Invalid email or password attempt.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials. Please verify your email and password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'This user account is suspended.',
      });
    }

    const token = generateToken(user);

    logAudit({
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      targetResource: 'AUTH',
      targetId: user._id.toString(),
      outcome: 'SUCCESS',
      reason: 'User logged in successfully.',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
    });
  }
};

const register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Full name, email, and password are required.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: 'A user with this email address already exists.',
      });
    }

    // Default to ACCOUNT_HOLDER unless created by ADMIN
    const assignedRole = req.user && req.user.role === 'ADMIN' && role ? role : 'ACCOUNT_HOLDER';

    const user = await User.create({
      fullName,
      email: email.toLowerCase().trim(),
      password,
      role: assignedRole,
    });

    const token = generateToken(user);

    await logAudit({
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_REGISTER',
      targetResource: 'USER',
      targetId: user._id.toString(),
      outcome: 'SUCCESS',
      reason: 'New user registered.',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
    });
  }
};

const getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
      role: req.user.role,
    },
  });
};

module.exports = {
  login,
  register,
  getMe,
};

