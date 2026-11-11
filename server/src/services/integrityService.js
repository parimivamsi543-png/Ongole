const LedgerEntry = require('../models/LedgerEntry');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { LEDGER_ENTRY_TYPES, TRANSACTION_STATUS } = require('../config/constants');
const { logAudit } = require('./auditService');

/**
 * Runs an exhaustive, cryptographic and mathematical integrity audit
 * across all accounts, transactions, and ledger entries.
 */
const verifySystemIntegrity = async (actor = null) => {
  const result = {
    timestamp: new Date().toISOString(),
    isMathematicallySound: true,
    isHashChainIntact: true,
    isDoubleEntryBalanced: true,
    isAccountBalanceReconciled: true,
    totalLedgerEntries: 0,
    totalTransactions: 0,
    totalDebits: 0,
    totalCredits: 0,
    discrepancies: [],
  };

  // 1. Fetch all ledger entries sorted by sequenceNumber
  const entries = await LedgerEntry.find().sort({ sequenceNumber: 1 });
  result.totalLedgerEntries = entries.length;

  let totalDebits = 0;
  let totalCredits = 0;
  let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const computedAccountBalances = {};

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Cryptographic Chain Validation
    if (entry.previousHash !== expectedPrevHash) {
      result.isHashChainIntact = false;
      result.discrepancies.push({
        type: 'HASH_CHAIN_BROKEN',
        sequenceNumber: entry.sequenceNumber,
        expectedPrevHash,
        actualPrevHash: entry.previousHash,
      });
    }

    // Recompute current hash
    const recomputedHash = LedgerEntry.calculateHash({
      sequenceNumber: entry.sequenceNumber,
      entryId: entry.entryId,
      transactionId: entry.transactionId,
      accountId: entry.accountId,
      entryType: entry.entryType,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      previousHash: entry.previousHash,
      createdAt: entry.createdAt,
    });

    if (recomputedHash !== entry.hash) {
      result.isHashChainIntact = false;
      result.discrepancies.push({
        type: 'RECORD_TAMPERED',
        sequenceNumber: entry.sequenceNumber,
        storedHash: entry.hash,
        recomputedHash,
      });
    }

    expectedPrevHash = entry.hash;

    // Sum debits & credits
    if (entry.entryType === LEDGER_ENTRY_TYPES.DEBIT) {
      totalDebits = Math.round((totalDebits + entry.amount) * 100) / 100;
    } else if (entry.entryType === LEDGER_ENTRY_TYPES.CREDIT) {
      totalCredits = Math.round((totalCredits + entry.amount) * 100) / 100;
    }

    // Track running balance
    const accId = entry.accountId.toString();
    if (!computedAccountBalances[accId]) {
      computedAccountBalances[accId] = 0;
    }
    // For standard accounts: Credits increase balance, Debits decrease balance
    if (entry.entryType === LEDGER_ENTRY_TYPES.CREDIT) {
      computedAccountBalances[accId] = Math.round((computedAccountBalances[accId] + entry.amount) * 100) / 100;
    } else {
      computedAccountBalances[accId] = Math.round((computedAccountBalances[accId] - entry.amount) * 100) / 100;
    }
  }

  result.totalDebits = totalDebits;
  result.totalCredits = totalCredits;

  // Invariant 1: Double-Entry Conservation (Total Debits == Total Credits)
  if (totalDebits !== totalCredits) {
    result.isDoubleEntryBalanced = false;
    result.discrepancies.push({
      type: 'DOUBLE_ENTRY_IMBALANCE',
      totalDebits,
      totalCredits,
      variance: Math.round((totalDebits - totalCredits) * 100) / 100,
    });
  }

  // Invariant 2: Per-Transaction Double-Entry Balance
  const transactions = await Transaction.find({ status: TRANSACTION_STATUS.POSTED });
  result.totalTransactions = transactions.length;

  for (const tx of transactions) {
    const txEntries = await LedgerEntry.find({ transactionId: tx._id });
    let txDebit = 0;
    let txCredit = 0;

    for (const e of txEntries) {
      if (e.entryType === LEDGER_ENTRY_TYPES.DEBIT) txDebit += e.amount;
      if (e.entryType === LEDGER_ENTRY_TYPES.CREDIT) txCredit += e.amount;
    }

    txDebit = Math.round(txDebit * 100) / 100;
    txCredit = Math.round(txCredit * 100) / 100;

    if (txDebit !== txCredit || txDebit !== tx.amount) {
      result.isDoubleEntryBalanced = false;
      result.discrepancies.push({
        type: 'TRANSACTION_POSTING_IMBALANCE',
        transactionId: tx.transactionId,
        txAmount: tx.amount,
        debitSum: txDebit,
        creditSum: txCredit,
      });
    }
  }

  // Invariant 3: Reconcile current Account balances with Ledger recomputation
  const accounts = await Account.find();
  for (const acc of accounts) {
    const expected = computedAccountBalances[acc._id.toString()] || 0;
    const actual = acc.balance;

    if (Math.abs(expected - actual) > 0.001) {
      result.isAccountBalanceReconciled = false;
      result.discrepancies.push({
        type: 'ACCOUNT_BALANCE_DESYNC',
        accountNumber: acc.accountNumber,
        actualBalance: actual,
        recomputedFromLedger: expected,
      });
    }
  }

  result.isMathematicallySound =
    result.isHashChainIntact &&
    result.isDoubleEntryBalanced &&
    result.isAccountBalanceReconciled &&
    result.discrepancies.length === 0;

  // Record audit log
  if (actor) {
    await logAudit({
      actorId: actor._id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: result.isMathematicallySound ? 'INTEGRITY_VERIFIED' : 'TAMPER_DETECTED',
      targetResource: 'SYSTEM_LEDGER',
      outcome: result.isMathematicallySound ? 'SUCCESS' : 'FAILED',
      reason: result.isMathematicallySound
        ? 'Full ledger integrity verified. Cryptographic chain and double-entry invariants confirmed.'
        : `Ledger integrity check detected ${result.discrepancies.length} discrepancy(s).`,
      details: {
        totalEntries: result.totalLedgerEntries,
        isMathematicallySound: result.isMathematicallySound,
        discrepanciesCount: result.discrepancies.length,
      },
    });
  }

  return result;
};

module.exports = {
  verifySystemIntegrity,
};

