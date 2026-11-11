const crypto = require('crypto');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const { logAudit } = require('../services/auditService');

const canonicalize = (val) => {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(canonicalize);
  return Object.keys(val)
    .sort()
    .reduce((acc, k) => {
      acc[k] = canonicalize(val[k]);
      return acc;
    }, {});
};

const hashPayload = (payload) => {
  const normalized = JSON.stringify(canonicalize(payload || {}));
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

const handleIdempotency = async (req, res, next) => {
  // Support key in header or request body
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

  // If no idempotency key is provided, proceed normally (or require one for write transactions)
  if (!idempotencyKey) {
    return next();
  }

  const endpoint = req.originalUrl || req.url;
  const requestHash = hashPayload({
    endpoint,
    body: req.body,
    userId: req.user ? req.user._id.toString() : 'ANON',
  });

  try {
    // Check if record already exists
    let record = await IdempotencyRecord.findOne({ key: idempotencyKey });

    if (record) {
      // Replay check
      if (record.status === 'COMPLETED') {
        if (record.requestHash !== requestHash) {
          await logAudit({
            actorId: req.user?._id,
            actorEmail: req.user?.email,
            actorRole: req.user?.role,
            action: 'IDEMPOTENCY_TAMPER_ATTEMPT',
            targetResource: endpoint,
            targetId: idempotencyKey,
            outcome: 'REFUSED',
            reason: 'Idempotency key reused with different request payload.',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });

          return res.status(409).json({
            success: false,
            error: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key reused with mismatched request payload.',
          });
        }

        // Return exact cached outcome
        res.setHeader('Idempotent-Replay', 'true');
        res.setHeader('X-Idempotency-Key', idempotencyKey);

        await logAudit({
          actorId: req.user?._id,
          actorEmail: req.user?.email,
          actorRole: req.user?.role,
          action: 'TRANSACTION_IDEMPOTENT_HIT',
          targetResource: endpoint,
          targetId: idempotencyKey,
          outcome: 'SUCCESS',
          reason: 'Duplicate request intercepted; cached transaction outcome returned without re-posting.',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(record.responseCode || 200).json(record.responseBody);
      }

      if (record.status === 'IN_PROGRESS') {
        return res.status(409).json({
          success: false,
          error: 'IDEMPOTENCY_LOCKED',
          message: 'A transaction with this idempotency key is currently being processed. Please retry shortly.',
        });
      }
    }

    // Try to acquire lock atomically by creating record
    try {
      record = await IdempotencyRecord.create({
        key: idempotencyKey,
        userId: req.user ? req.user._id : null,
        endpoint,
        requestHash,
        status: 'IN_PROGRESS',
        lockedAt: new Date(),
      });
    } catch (createErr) {
      // Duplicate key race condition
      if (createErr.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'CONCURRENT_REQUEST_BLOCKED',
          message: 'Concurrent request with identical idempotency key detected and blocked.',
        });
      }
      throw createErr;
    }

    // Intercept response to persist outcome before sending to client
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode || 200;
      IdempotencyRecord.updateOne(
        { key: idempotencyKey },
        {
          status: 'COMPLETED',
          responseCode: statusCode,
          responseBody: body,
          completedAt: new Date(),
        }
      )
        .exec()
        .catch((e) => console.error('[Idempotency] Failed to save completion:', e.message))
        .finally(() => {
          res.setHeader('X-Idempotency-Key', idempotencyKey);
          originalJson(body);
        });
      return res;
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleIdempotency,
  hashPayload,
};

