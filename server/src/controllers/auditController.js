const AuditLog = require('../models/AuditLog');
const LedgerEntry = require('../models/LedgerEntry');
const { verifySystemIntegrity } = require('../services/integrityService');

const getAuditLogs = async (req, res) => {
  try {
    const { action, outcome, targetResource, limit = 50, page = 1 } = req.query;
    let query = {};

    if (action) query.action = action;
    if (outcome) query.outcome = outcome;
    if (targetResource) query.targetResource = targetResource;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const verifyIntegrity = async (req, res) => {
  try {
    const result = await verifySystemIntegrity(req.user);
    res.json({
      success: true,
      integrity: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getLedgerEntries = async (req, res) => {
  try {
    const { limit = 60, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [entries, total] = await Promise.all([
      LedgerEntry.find()
        .populate('accountId', 'accountNumber name accountType')
        .populate('transactionId', 'transactionId type status description')
        .sort({ sequenceNumber: -1 })
        .skip(skip)
        .limit(Number(limit)),
      LedgerEntry.countDocuments(),
    ]);

    res.json({
      success: true,
      count: entries.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      entries,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getAuditLogs,
  verifyIntegrity,
  getLedgerEntries,
};

