const mongoose = require('mongoose');
const crypto = require('crypto');
const { LEDGER_ENTRY_TYPES } = require('../config/constants');

const ledgerEntrySchema = new mongoose.Schema(
  {
    entryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: Object.values(LEDGER_ENTRY_TYPES),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be positive'],
      set: (v) => Math.round(v * 100) / 100,
    },
    balanceAfter: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    sequenceNumber: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    previousHash: {
      type: String,
      required: true,
    },
    hash: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Calculation helper for SHA-256 hash
ledgerEntrySchema.statics.calculateHash = function ({
  sequenceNumber,
  entryId,
  transactionId,
  accountId,
  entryType,
  amount,
  balanceAfter,
  previousHash,
  createdAt,
}) {
  const payload = [
    sequenceNumber,
    entryId,
    transactionId ? transactionId.toString() : '',
    accountId ? accountId.toString() : '',
    entryType,
    Number(amount).toFixed(2),
    Number(balanceAfter).toFixed(2),
    previousHash,
    new Date(createdAt).toISOString(),
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
};

// Prevent deletion and modification at schema level
ledgerEntrySchema.pre('remove', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Direct removal of ledger entries is strictly prohibited.');
});

ledgerEntrySchema.pre('deleteOne', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Direct deletion of ledger entries is strictly prohibited.');
});

ledgerEntrySchema.pre('deleteMany', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Bulk deletion of ledger entries is strictly prohibited.');
});

ledgerEntrySchema.pre('findOneAndUpdate', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Updating ledger entries is strictly prohibited.');
});

ledgerEntrySchema.pre('updateOne', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Updating ledger entries is strictly prohibited.');
});

ledgerEntrySchema.pre('updateMany', function () {
  throw new Error('LEDGER_IMMUTABILITY_VIOLATION: Updating ledger entries is strictly prohibited.');
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);

