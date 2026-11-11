const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const LedgerChainState = require('../models/LedgerChainState');
const {
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  LEDGER_ENTRY_TYPES,
  ACCOUNT_STATUS,
  SYSTEM_ACCOUNTS,
} = require('../config/constants');
const { logAudit } = require('./auditService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (err) => {
  if (!err) return false;
  if (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError')) {
    return true;
  }
  if (err.code === 112 || err.codeName === 'WriteConflict') {
    return true;
  }
  if (err.message && (err.message.includes('CONCURRENCY_CONFLICT') || err.message.includes('Write conflict'))) {
    return true;
  }
  return false;
};

/**
 * Ensures system settlement & clearing accounts exist in the database
 */
const getOrCreateSystemAccount = async (accountConfig, session = null) => {
  const query = { accountNumber: accountConfig.number };
  let account = await Account.findOne(query).session(session);
  if (!account) {
    const opts = session ? { session } : {};
    try {
      const created = await Account.create(
        [
          {
            accountNumber: accountConfig.number,
            name: accountConfig.name,
            accountType: accountConfig.type,
            currency: 'USD',
            balance: 0,
            overdraftLimit: 1000000000, // Institutional clearing facility
            status: ACCOUNT_STATUS.ACTIVE,
            isSystem: true,
          },
        ],
        opts
      );
      account = created[0];
    } catch (err) {
      if (err.code === 11000) {
        account = await Account.findOne(query).session(session);
      } else {
        throw err;
      }
    }
  }
  return account;
};

/**
 * Single attempt execution inside a MongoDB ACID transaction
 */
const attemptTransactionOnce = async ({
  type,
  roundedAmount,
  actorId,
  actorEmail,
  actorRole,
  sourceAccountId,
  destinationAccountId,
  description,
  idempotencyKey,
  metadata,
}) => {
  // Check service-level idempotency first
  if (idempotencyKey) {
    const existingTx = await Transaction.findOne({ idempotencyKey });
    if (existingTx) {
      const existingEntries = await LedgerEntry.find({ transactionId: existingTx._id }).sort({ sequenceNumber: 1 });
      return {
        success: existingTx.status === TRANSACTION_STATUS.POSTED,
        idempotentReplay: true,
        status: existingTx.status,
        transactionId: existingTx.transactionId,
        transaction: existingTx,
        ledgerEntries: existingEntries,
        reason: existingTx.failureReason || undefined,
      };
    }
  }

  const transactionId = uuidv4();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let sourceAcc;
    let destAcc;

    // Resolve accounts based on transaction type
    if (type === TRANSACTION_TYPES.DEPOSIT) {
      sourceAcc = await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.CLEARING, session);
      destAcc = await Account.findById(destinationAccountId).session(session);
      if (!destAcc) throw new Error('DESTINATION_ACCOUNT_NOT_FOUND: Customer deposit target account does not exist.');
    } else if (type === TRANSACTION_TYPES.WITHDRAWAL) {
      sourceAcc = await Account.findById(sourceAccountId).session(session);
      destAcc = await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.CLEARING, session);
      if (!sourceAcc) throw new Error('SOURCE_ACCOUNT_NOT_FOUND: Withdrawal source account does not exist.');
    } else if (type === TRANSACTION_TYPES.TRANSFER) {
      if (sourceAccountId.toString() === destinationAccountId.toString()) {
        throw new Error('IDENTICAL_ACCOUNTS: Source and destination accounts cannot be identical.');
      }
      sourceAcc = await Account.findById(sourceAccountId).session(session);
      destAcc = await Account.findById(destinationAccountId).session(session);
      if (!sourceAcc) throw new Error('SOURCE_ACCOUNT_NOT_FOUND: Source account does not exist.');
      if (!destAcc) throw new Error('DESTINATION_ACCOUNT_NOT_FOUND: Destination account does not exist.');
    } else {
      throw new Error(`UNSUPPORTED_TRANSACTION_TYPE: ${type}`);
    }

    const txIdempotencyPatch = idempotencyKey ? { idempotencyKey } : {};

    // Check account status (ACTIVE required for posting)
    if (sourceAcc.status !== ACCOUNT_STATUS.ACTIVE || destAcc.status !== ACCOUNT_STATUS.ACTIVE) {
      const refusalReason =
        sourceAcc.status !== ACCOUNT_STATUS.ACTIVE
          ? `SOURCE_ACCOUNT_INACTIVE: Account ${sourceAcc.accountNumber} is ${sourceAcc.status}.`
          : `DESTINATION_ACCOUNT_INACTIVE: Account ${destAcc.accountNumber} is ${destAcc.status}.`;

      await Transaction.create(
        [
          {
            transactionId,
            ...txIdempotencyPatch,
            type,
            amount: roundedAmount,
            sourceAccountId: sourceAcc._id,
            destinationAccountId: destAcc._id,
            actorId,
            status: TRANSACTION_STATUS.REJECTED,
            description,
            failureReason: refusalReason,
            metadata,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      await logAudit({
        actorId,
        actorEmail,
        actorRole,
        action: 'TRANSACTION_REFUSED',
        targetResource: 'TRANSACTION',
        targetId: transactionId,
        outcome: 'REFUSED',
        reason: refusalReason,
        details: { type, amount: roundedAmount, sourceAccount: sourceAcc.accountNumber, destinationAccount: destAcc.accountNumber },
      });

      return {
        success: false,
        status: TRANSACTION_STATUS.REJECTED,
        transactionId,
        reason: refusalReason,
      };
    }

    // Invariant 4: Negative Balance Prevention
    const availableBalance = Math.round((sourceAcc.balance + (sourceAcc.overdraftLimit || 0)) * 100) / 100;
    if (availableBalance < roundedAmount) {
      const refusalReason = `INSUFFICIENT_FUNDS: Available balance ($${availableBalance.toFixed(2)}) is insufficient for required amount ($${roundedAmount.toFixed(2)}) on account ${sourceAcc.accountNumber}.`;

      await Transaction.create(
        [
          {
            transactionId,
            ...txIdempotencyPatch,
            type,
            amount: roundedAmount,
            sourceAccountId: sourceAcc._id,
            destinationAccountId: destAcc._id,
            actorId,
            status: TRANSACTION_STATUS.REJECTED,
            description,
            failureReason: refusalReason,
            metadata,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      await logAudit({
        actorId,
        actorEmail,
        actorRole,
        action: 'TRANSACTION_REFUSED',
        targetResource: 'TRANSACTION',
        targetId: transactionId,
        outcome: 'REFUSED',
        reason: refusalReason,
        details: { type, amount: roundedAmount, sourceAccount: sourceAcc.accountNumber, availableBalance },
      });

      return {
        success: false,
        status: TRANSACTION_STATUS.REJECTED,
        transactionId,
        reason: refusalReason,
      };
    }

    // Acquire exclusive ledger chain lock inside the MongoDB transaction
    // Ensures strictly monotonic sequenceNumber & unbroken SHA-256 chain across concurrent threads
    const chainHead = await LedgerChainState.findOneAndUpdate(
      { _id: 'LEDGER_CHAIN_HEAD' },
      { $inc: { lockTick: 1 } },
      { session, upsert: true, new: true }
    );

    const lastEntry = await LedgerEntry.findOne().sort({ sequenceNumber: -1 }).session(session);
    const nextSeq = (lastEntry ? lastEntry.sequenceNumber : chainHead.sequenceNumber || 0) + 1;
    const prevHash = lastEntry
      ? lastEntry.hash
      : chainHead.lastHash || '0000000000000000000000000000000000000000000000000000000000000000';

    // Calculate new balances
    const newSourceBalance = Math.round((sourceAcc.balance - roundedAmount) * 100) / 100;
    const newDestBalance = Math.round((destAcc.balance + roundedAmount) * 100) / 100;

    // Optimistic Concurrency Control + Conditional Update on source account
    const updatedSource = await Account.findOneAndUpdate(
      {
        _id: sourceAcc._id,
        version: sourceAcc.version,
        balance: sourceAcc.balance,
      },
      {
        $set: { balance: newSourceBalance },
        $inc: { version: 1 },
      },
      { session, new: true }
    );

    if (!updatedSource) {
      throw new Error('CONCURRENCY_CONFLICT: Source account was modified concurrently.');
    }

    // Optimistic Concurrency Control on destination account
    const updatedDest = await Account.findOneAndUpdate(
      {
        _id: destAcc._id,
        version: destAcc.version,
        balance: destAcc.balance,
      },
      {
        $set: { balance: newDestBalance },
        $inc: { version: 1 },
      },
      { session, new: true }
    );

    if (!updatedDest) {
      throw new Error('CONCURRENCY_CONFLICT: Destination account was modified concurrently.');
    }

    // Create Transaction Record
    const postedAt = new Date();
    const [txRecord] = await Transaction.create(
      [
        {
          transactionId,
          ...txIdempotencyPatch,
          type,
          amount: roundedAmount,
          sourceAccountId: sourceAcc._id,
          destinationAccountId: destAcc._id,
          actorId,
          status: TRANSACTION_STATUS.POSTED,
          description,
          postedAt,
          metadata,
        },
      ],
      { session }
    );

    // Invariant 1: Double-Entry Accounting (DEBIT Source, CREDIT Destination)
    const debitEntryId = uuidv4();
    const debitCreatedAt = new Date();
    const debitHash = LedgerEntry.calculateHash({
      sequenceNumber: nextSeq,
      entryId: debitEntryId,
      transactionId: txRecord._id,
      accountId: sourceAcc._id,
      entryType: LEDGER_ENTRY_TYPES.DEBIT,
      amount: roundedAmount,
      balanceAfter: newSourceBalance,
      previousHash: prevHash,
      createdAt: debitCreatedAt,
    });

    const debitEntry = {
      entryId: debitEntryId,
      transactionId: txRecord._id,
      accountId: sourceAcc._id,
      entryType: LEDGER_ENTRY_TYPES.DEBIT,
      amount: roundedAmount,
      balanceAfter: newSourceBalance,
      sequenceNumber: nextSeq,
      previousHash: prevHash,
      hash: debitHash,
      createdAt: debitCreatedAt,
    };

    const creditEntryId = uuidv4();
    const creditCreatedAt = new Date(debitCreatedAt.getTime() + 1);
    const creditSeq = nextSeq + 1;
    const creditHash = LedgerEntry.calculateHash({
      sequenceNumber: creditSeq,
      entryId: creditEntryId,
      transactionId: txRecord._id,
      accountId: destAcc._id,
      entryType: LEDGER_ENTRY_TYPES.CREDIT,
      amount: roundedAmount,
      balanceAfter: newDestBalance,
      previousHash: debitHash,
      createdAt: creditCreatedAt,
    });

    const creditEntry = {
      entryId: creditEntryId,
      transactionId: txRecord._id,
      accountId: destAcc._id,
      entryType: LEDGER_ENTRY_TYPES.CREDIT,
      amount: roundedAmount,
      balanceAfter: newDestBalance,
      sequenceNumber: creditSeq,
      previousHash: debitHash,
      hash: creditHash,
      createdAt: creditCreatedAt,
    };

    if (debitEntry.amount !== creditEntry.amount) {
      throw new Error('LEDGER_INVARIANT_VIOLATION: Total debits must strictly equal total credits.');
    }

    await LedgerEntry.create([debitEntry, creditEntry], { session, ordered: true });

    // Persist new chain head state inside the same atomic transaction
    await LedgerChainState.updateOne(
      { _id: 'LEDGER_CHAIN_HEAD' },
      { $set: { sequenceNumber: creditSeq, lastHash: creditHash } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await logAudit({
      actorId,
      actorEmail,
      actorRole,
      action: 'TRANSACTION_POSTED',
      targetResource: 'TRANSACTION',
      targetId: transactionId,
      outcome: 'SUCCESS',
      details: {
        type,
        amount: roundedAmount,
        sourceAccount: sourceAcc.accountNumber,
        destinationAccount: destAcc.accountNumber,
        debitSeq: nextSeq,
        creditSeq,
      },
    });

    return {
      success: true,
      status: TRANSACTION_STATUS.POSTED,
      transactionId,
      transaction: txRecord,
      sourceAccount: {
        id: sourceAcc._id,
        accountNumber: sourceAcc.accountNumber,
        balance: newSourceBalance,
      },
      destinationAccount: {
        id: destAcc._id,
        accountNumber: destAcc.accountNumber,
        balance: newDestBalance,
      },
      ledgerEntries: [debitEntry, creditEntry],
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    throw error;
  }
};

/**
 * Executes a Financial Transaction with automatic retry on transient MongoDB
 * write conflicts / OCC collisions so concurrent bursts resolve deterministically.
 */
const executeFinancialTransaction = async ({
  type,
  amount,
  actorId,
  actorEmail,
  actorRole,
  sourceAccountId = null,
  destinationAccountId = null,
  description = '',
  idempotencyKey = null,
  metadata = {},
}) => {
  const roundedAmount = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new Error('INVALID_AMOUNT: Transaction amount must be greater than 0.00');
  }

  const MAX_RETRIES = 25;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptTransactionOnce({
        type,
        roundedAmount,
        actorId,
        actorEmail,
        actorRole,
        sourceAccountId,
        destinationAccountId,
        description,
        idempotencyKey,
        metadata,
      });
    } catch (err) {
      lastError = err;
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        // Jittered exponential backoff to serialize concurrent contentions cleanly
        const backoffMs = Math.min(250, 20 * attempt + Math.floor(Math.random() * 50));
        await sleep(backoffMs);
        continue;
      }

      // Non-retryable failure or exhausted retries
      await logAudit({
        actorId,
        actorEmail,
        actorRole,
        action: 'TRANSACTION_FAILED',
        targetResource: 'TRANSACTION',
        outcome: 'FAILED',
        reason: err.message,
        details: { type, amount: roundedAmount, attempt },
      });

      throw err;
    }
  }

  throw lastError;
};

module.exports = {
  executeFinancialTransaction,
  getOrCreateSystemAccount,
};
