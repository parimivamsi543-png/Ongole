const Account = require('../models/Account');
const User = require('../models/User');
const { ROLES, ACCOUNT_STATUS, ACCOUNT_TYPES } = require('../config/constants');
const { logAudit } = require('../services/auditService');

// Get accounts owned by currently authenticated user
const getMyAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ ownerId: req.user._id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: accounts.length,
      accounts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin and Auditor: List all accounts across system
const getAllAccounts = async (req, res) => {
  try {
    const accounts = await Account.find()
      .populate('ownerId', 'fullName email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: accounts.length,
      accounts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get single account by ID (ownership checked via middleware)
const getAccountById = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id).populate('ownerId', 'fullName email role');
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({
      success: true,
      account,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Create a new bank account
const createAccount = async (req, res) => {
  try {
    const { name, accountType, initialBalance = 0, ownerId, overdraftLimit = 0 } = req.body;

    let targetOwnerId;
    if (req.user.role === ROLES.ADMIN) {
      targetOwnerId = ownerId || req.user._id;
    } else {
      targetOwnerId = req.user._id;
    }

    const owner = await User.findById(targetOwnerId);
    if (!owner) {
      return res.status(404).json({ success: false, error: 'Target owner user not found.' });
    }

    // Generate unique account number: e.g. ACC-2026-XXXXX
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const accountNumber = `ACC-${new Date().getFullYear()}-${randomSuffix}`;
    const safeType = [ACCOUNT_TYPES.CHECKING, ACCOUNT_TYPES.SAVINGS].includes(accountType)
      ? accountType
      : ACCOUNT_TYPES.CHECKING;

    const newAccount = await Account.create({
      accountNumber,
      name: name || `${owner.fullName} ${safeType}`,
      ownerId: targetOwnerId,
      accountType: safeType,
      balance: 0, // Invariant: Money is not created out of thin air! Use deposit for initial funds
      overdraftLimit: req.user.role === ROLES.ADMIN ? Math.max(0, Number(overdraftLimit) || 0) : 0,
      status: ACCOUNT_STATUS.ACTIVE,
    });

    await logAudit({
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'ACCOUNT_CREATE',
      targetResource: 'ACCOUNT',
      targetId: newAccount._id.toString(),
      outcome: 'SUCCESS',
      reason: `Account ${accountNumber} created for ${owner.email}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      account: newAccount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin: Update account status (ACTIVE, FROZEN, CLOSED)
const updateAccountStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.values(ACCOUNT_STATUS).includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of [${Object.values(ACCOUNT_STATUS).join(', ')}]`,
      });
    }

    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const oldStatus = account.status;
    account.status = status;
    await account.save();

    await logAudit({
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'ACCOUNT_STATUS_CHANGE',
      targetResource: 'ACCOUNT',
      targetId: account._id.toString(),
      outcome: 'SUCCESS',
      reason: `Account ${account.accountNumber} status changed from ${oldStatus} to ${status}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      account,
      message: `Account status updated to ${status}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Transfer recipient directory (non-sensitive fields only: excludes balances)
const getTransferDirectory = async (req, res) => {
  try {
    const accounts = await Account.find({ isSystem: false, status: ACCOUNT_STATUS.ACTIVE })
      .select('_id accountNumber name accountType ownerId')
      .populate('ownerId', 'fullName email')
      .sort({ accountNumber: 1 });

    res.json({
      success: true,
      directory: accounts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin: List all users for account oversight
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin: Configure explicitly documented and authorized overdraft arrangement
const updateOverdraftLimit = async (req, res) => {
  try {
    const { overdraftLimit, justification } = req.body;
    const numericLimit = Math.round(Number(overdraftLimit) * 100) / 100;

    if (!Number.isFinite(numericLimit) || numericLimit < 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OVERDRAFT_LIMIT',
        message: 'Overdraft limit must be a non-negative number.',
      });
    }

    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const oldLimit = account.overdraftLimit;
    account.overdraftLimit = numericLimit;
    await account.save();

    await logAudit({
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'ACCOUNT_OVERDRAFT_CONFIGURED',
      targetResource: 'ACCOUNT',
      targetId: account._id.toString(),
      outcome: 'SUCCESS',
      reason: justification || `Overdraft limit changed from ₹${oldLimit} to ₹${numericLimit}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { accountNumber: account.accountNumber, oldLimit, newLimit: numericLimit },
    });

    res.json({
      success: true,
      account,
      message: `Authorized overdraft limit set to ₹${numericLimit.toFixed(2)}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getMyAccounts,
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccountStatus,
  getTransferDirectory,
  getAllUsers,
  updateOverdraftLimit,
};

