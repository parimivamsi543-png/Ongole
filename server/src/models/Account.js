const mongoose = require('mongoose');
const { ACCOUNT_TYPES, ACCOUNT_STATUS } = require('../config/constants');

const accountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Null for system accounts (e.g. Clearing, Reserve)
    },
    accountType: {
      type: String,
      enum: Object.values(ACCOUNT_TYPES),
      default: ACCOUNT_TYPES.CHECKING,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    balance: {
      type: Number,
      default: 0,
      set: (v) => Math.round(v * 100) / 100, // round to 2 decimals
    },
    overdraftLimit: {
      type: Number,
      default: 0,
      min: [0, 'Overdraft limit cannot be negative'],
    },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      required: true,
    },
    version: {
      type: Number,
      default: 0,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup
accountSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model('Account', accountSchema);

