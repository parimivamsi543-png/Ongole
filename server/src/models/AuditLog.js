const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorEmail: {
      type: String,
      default: 'ANONYMOUS',
    },
    actorRole: {
      type: String,
      default: 'UNAUTHENTICATED',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetResource: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      default: null,
    },
    outcome: {
      type: String,
      enum: ['SUCCESS', 'REFUSED', 'FAILED', 'BLOCKED'],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetResource: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

