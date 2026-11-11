const { ROLES } = require('../config/constants');
const Account = require('../models/Account');
const { logAudit } = require('../services/auditService');

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'You must be logged in to access this resource.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logAudit({
        actorId: req.user._id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'RBAC_VIOLATION_ATTEMPT',
        targetResource: req.baseUrl + req.path,
        targetId: null,
        outcome: 'BLOCKED',
        reason: `Role ${req.user.role} is not permitted. Required: ${allowedRoles.join(', ')}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Forbidden: Access requires one of [${allowedRoles.join(', ')}]. Your role is ${req.user.role}.`,
      });
    }

    next();
  };
};

// Ensures that an account holder only operates on or views their own accounts
const requireAccountOwnership = (paramField = 'id', bodyField = null) => {
  return async (req, res, next) => {
    try {
      const accountId = bodyField ? req.body[bodyField] : req.params[paramField];
      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_ACCOUNT_ID',
          message: 'Account ID is required for verification.',
        });
      }

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found.',
        });
      }

      // Admins and Auditors have broad read access, but for write transactions,
      // Auditors are read-only.
      if (req.user.role === ROLES.ADMIN) {
        req.targetAccount = account;
        return next();
      }

      if (req.user.role === ROLES.AUDITOR) {
        if (req.method !== 'GET') {
          return res.status(403).json({
            success: false,
            error: 'AUDITOR_READ_ONLY',
            message: 'Auditors are restricted to read-only operations.',
          });
        }
        req.targetAccount = account;
        return next();
      }

      // ACCOUNT_HOLDER must be the registered owner of this account
      if (account.ownerId && account.ownerId.toString() !== req.user._id.toString()) {
        await logAudit({
          actorId: req.user._id,
          actorEmail: req.user.email,
          actorRole: req.user.role,
          action: 'UNAUTHORIZED_ACCOUNT_ACCESS_ATTEMPT',
          targetResource: 'ACCOUNT',
          targetId: account._id.toString(),
          outcome: 'REFUSED',
          reason: `Account holder ${req.user.email} attempted to access account ${account.accountNumber} owned by another user.`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: 'Access denied: You do not have permission to view or transact on this account.',
        });
      }

      req.targetAccount = account;
      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'AUTHORIZATION_ERROR',
        message: err.message,
      });
    }
  };
};

module.exports = {
  requireRole,
  requireAccountOwnership,
};

