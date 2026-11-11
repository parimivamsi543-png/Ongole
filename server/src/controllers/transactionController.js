const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const Account = require('../models/Account');
const { ROLES, TRANSACTION_TYPES } = require('../config/constants');
const { executeFinancialTransaction } = require('../services/ledgerService');
const { logAudit } = require('../services/auditService');

// Deposit Funds
const deposit = async (req, res) => {
  try {
    const { destinationAccountId, amount, description } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    if (!destinationAccountId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'destinationAccountId and amount are required.',
      });
    }

    // Verify account existence and ownership
    const destAccount = await Account.findById(destinationAccountId);
    if (!destAccount) {
      return res.status(404).json({ success: false, error: 'Destination account not found.' });
    }

    // Account Holder can only deposit into their own account (unless Admin)
    if (req.user.role === ROLES.ACCOUNT_HOLDER && destAccount.ownerId.toString() !== req.user._id.toString()) {
      await logAudit({
        actorId: req.user._id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'UNAUTHORIZED_DEPOSIT_ATTEMPT',
        targetResource: 'ACCOUNT',
        targetId: destAccount._id.toString(),
        outcome: 'REFUSED',
        reason: 'Attempted deposit into an account owned by another customer.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ACCOUNT_ACCESS',
        message: 'You can only deposit into your own accounts.',
      });
    }

    const result = await executeFinancialTransaction({
      type: TRANSACTION_TYPES.DEPOSIT,
      amount,
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      destinationAccountId,
      description: description || 'Customer Deposit',
      idempotencyKey,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'TRANSACTION_REJECTED',
      message: error.message,
    });
  }
};

// Withdraw Funds
const withdraw = async (req, res) => {
  try {
    const { sourceAccountId, amount, description } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    if (!sourceAccountId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'sourceAccountId and amount are required.',
      });
    }

    const sourceAccount = await Account.findById(sourceAccountId);
    if (!sourceAccount) {
      return res.status(404).json({ success: false, error: 'Source account not found.' });
    }

    // Ownership check for ACCOUNT_HOLDER
    if (req.user.role === ROLES.ACCOUNT_HOLDER && sourceAccount.ownerId.toString() !== req.user._id.toString()) {
      await logAudit({
        actorId: req.user._id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'UNAUTHORIZED_WITHDRAWAL_ATTEMPT',
        targetResource: 'ACCOUNT',
        targetId: sourceAccount._id.toString(),
        outcome: 'REFUSED',
        reason: 'Attempted withdrawal from an account owned by another customer.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ACCOUNT_ACCESS',
        message: 'You can only withdraw from your own accounts.',
      });
    }

    const result = await executeFinancialTransaction({
      type: TRANSACTION_TYPES.WITHDRAWAL,
      amount,
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      sourceAccountId,
      description: description || 'Customer Withdrawal',
      idempotencyKey,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'TRANSACTION_REJECTED',
      message: error.message,
    });
  }
};

// Transfer Funds Between Accounts
const transfer = async (req, res) => {
  try {
    const { sourceAccountId, destinationAccountId, amount, description } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    if (!sourceAccountId || !destinationAccountId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'sourceAccountId, destinationAccountId, and amount are required.',
      });
    }

    const sourceAccount = await Account.findById(sourceAccountId);
    if (!sourceAccount) {
      return res.status(404).json({ success: false, error: 'Source account not found.' });
    }

    const destAccount = await Account.findById(destinationAccountId);
    if (!destAccount) {
      return res.status(404).json({ success: false, error: 'Destination account not found.' });
    }

    // Ownership check: Account holder can only transfer FROM their own account
    if (req.user.role === ROLES.ACCOUNT_HOLDER && sourceAccount.ownerId.toString() !== req.user._id.toString()) {
      await logAudit({
        actorId: req.user._id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'UNAUTHORIZED_TRANSFER_ATTEMPT',
        targetResource: 'ACCOUNT',
        targetId: sourceAccount._id.toString(),
        outcome: 'REFUSED',
        reason: 'Attempted to initiate transfer from an unauthorized source account.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ACCOUNT_ACCESS',
        message: 'You can only initiate transfers from accounts you own.',
      });
    }

    const result = await executeFinancialTransaction({
      type: TRANSACTION_TYPES.TRANSFER,
      amount,
      actorId: req.user._id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      sourceAccountId,
      destinationAccountId,
      description: description || `Transfer to ${destAccount.accountNumber}`,
      idempotencyKey,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'TRANSACTION_REJECTED',
      message: error.message,
    });
  }
};

// Get Single Transaction with its balanced ledger entries
const getTransactionById = async (req, res) => {
  try {
    const tx = await Transaction.findOne({ transactionId: req.params.transactionId })
      .populate('sourceAccountId', 'accountNumber name accountType ownerId')
      .populate('destinationAccountId', 'accountNumber name accountType ownerId')
      .populate('actorId', 'fullName email role');

    if (!tx) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Verify access if Account Holder
    if (req.user.role === ROLES.ACCOUNT_HOLDER) {
      const srcOwner = tx.sourceAccountId?.ownerId?.toString();
      const destOwner = tx.destinationAccountId?.ownerId?.toString();
      const userId = req.user._id.toString();

      if (srcOwner !== userId && destOwner !== userId) {
        return res.status(403).json({ success: false, error: 'Access denied to this transaction.' });
      }
    }

    // Fetch double-entry ledger entries
    const ledgerEntries = await LedgerEntry.find({ transactionId: tx._id }).sort({ sequenceNumber: 1 });

    res.json({
      success: true,
      transaction: tx,
      ledgerEntries,
      isBalanced:
        ledgerEntries.length >= 2 &&
        ledgerEntries.some((e) => e.entryType === 'DEBIT') &&
        ledgerEntries.some((e) => e.entryType === 'CREDIT'),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// List transactions
const getAllTransactions = async (req, res) => {
  try {
    const { status, type, limit = 50, page = 1 } = req.query;
    let query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    // Scoped for ACCOUNT_HOLDER: only transactions touching user's accounts
    if (req.user.role === ROLES.ACCOUNT_HOLDER) {
      const userAccounts = await Account.find({ ownerId: req.user._id }).select('_id').lean();
      const accountIds = userAccounts.map((a) => a._id);

      query.$or = [{ sourceAccountId: { $in: accountIds } }, { destinationAccountId: { $in: accountIds } }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('sourceAccountId', 'accountNumber name accountType')
        .populate('destinationAccountId', 'accountNumber name accountType')
        .populate('actorId', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Transaction.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: transactions.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      transactions,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  deposit,
  withdraw,
  transfer,
  getTransactionById,
  getAllTransactions,
};

