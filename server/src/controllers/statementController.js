const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const { ROLES, TRANSACTION_STATUS, LEDGER_ENTRY_TYPES } = require('../config/constants');

const generateAccountStatement = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = req.query;

    const account = await Account.findById(accountId).populate('ownerId', 'fullName email role');
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Role check: ACCOUNT_HOLDER can only view statements for their own accounts
    if (req.user.role === ROLES.ACCOUNT_HOLDER && account.ownerId?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You can only generate statements for accounts you own.',
      });
    }

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Query all transactions touching this account (Both POSTED and REJECTED/FAILED)
    const txQuery = {
      $or: [{ sourceAccountId: account._id }, { destinationAccountId: account._id }],
      ...dateFilter,
    };

    const transactions = await Transaction.find(txQuery)
      .populate('sourceAccountId', 'accountNumber name')
      .populate('destinationAccountId', 'accountNumber name')
      .populate('actorId', 'fullName email role')
      .sort({ createdAt: 1 }); // chronological order for statement

    // Map through transactions and reconstruct running balances
    let totalInflow = 0;
    let totalOutflow = 0;
    let successfulCount = 0;
    let failedCount = 0;

    // Get all ledger entries for this account to get exact recorded balanceAfter
    const ledgerEntries = await LedgerEntry.find({ accountId: account._id });
    const ledgerMap = new Map();
    for (const entry of ledgerEntries) {
      ledgerMap.set(entry.transactionId.toString(), entry);
    }

    let runningBalanceTracker = 0;
    const statementItems = [];

    for (const tx of transactions) {
      const isSource = tx.sourceAccountId?._id.toString() === account._id.toString();
      const isDestination = tx.destinationAccountId?._id.toString() === account._id.toString();

      let direction = 'N/A';
      let entryType = null;
      let balanceAfter = null;

      if (tx.status === TRANSACTION_STATUS.POSTED) {
        successfulCount++;
        const ledgerEntry = ledgerMap.get(tx._id.toString());
        if (ledgerEntry) {
          balanceAfter = ledgerEntry.balanceAfter;
          runningBalanceTracker = balanceAfter;
          entryType = ledgerEntry.entryType;
        }

        if (isDestination && !isSource) {
          direction = 'CREDIT (+ INFLOW)';
          totalInflow = Math.round((totalInflow + tx.amount) * 100) / 100;
        } else if (isSource && !isDestination) {
          direction = 'DEBIT (- OUTFLOW)';
          totalOutflow = Math.round((totalOutflow + tx.amount) * 100) / 100;
        }
      } else {
        // Refused or failed attempt
        failedCount++;
        direction = 'REFUSED / ATTEMPT';
        balanceAfter = runningBalanceTracker; // Balance remained unchanged
      }

      statementItems.push({
        transactionId: tx.transactionId,
        date: tx.createdAt,
        type: tx.type,
        status: tx.status,
        amount: tx.amount,
        direction,
        entryType,
        sourceAccount: tx.sourceAccountId ? tx.sourceAccountId.accountNumber : 'EXTERNAL',
        destinationAccount: tx.destinationAccountId ? tx.destinationAccountId.accountNumber : 'EXTERNAL',
        runningBalance: balanceAfter !== null ? balanceAfter : runningBalanceTracker,
        actor: {
          id: tx.actorId?._id,
          name: tx.actorId?.fullName || 'System',
          email: tx.actorId?.email || 'system@ledgerline.io',
          role: tx.actorId?.role || 'SYSTEM',
        },
        description: tx.description,
        failureReason: tx.failureReason,
      });
    }

    res.json({
      success: true,
      statement: {
        account: {
          id: account._id,
          accountNumber: account.accountNumber,
          name: account.name,
          type: account.accountType,
          currency: account.currency,
          currentBalance: account.balance,
          overdraftLimit: account.overdraftLimit,
          status: account.status,
          owner: account.ownerId
            ? {
                fullName: account.ownerId.fullName,
                email: account.ownerId.email,
              }
            : null,
        },
        summary: {
          currentBalance: account.balance,
          totalInflow,
          totalOutflow,
          netCashFlow: Math.round((totalInflow - totalOutflow) * 100) / 100,
          totalTransactions: transactions.length,
          successfulTransactions: successfulCount,
          refusedAttempts: failedCount,
        },
        items: statementItems.reverse(), // latest first for presentation
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  generateAccountStatement,
};

