const AuditLog = require('../models/AuditLog');

const logAudit = async ({
  actorId = null,
  actorEmail = 'ANONYMOUS',
  actorRole = 'UNAUTHENTICATED',
  action,
  targetResource,
  targetId = null,
  outcome,
  reason = null,
  ipAddress = null,
  userAgent = null,
  details = {},
}) => {
  try {
    await AuditLog.create({
      actorId,
      actorEmail,
      actorRole,
      action,
      targetResource,
      targetId,
      outcome,
      reason,
      ipAddress,
      userAgent,
      details,
    });
  } catch (err) {
    console.error('[AuditService] Failed to record audit log:', err.message);
  }
};

module.exports = { logAudit };

