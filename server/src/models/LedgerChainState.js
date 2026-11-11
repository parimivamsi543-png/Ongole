const mongoose = require('mongoose');

const ledgerChainStateSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'LEDGER_CHAIN_HEAD',
    },
    sequenceNumber: {
      type: Number,
      default: 0,
    },
    lastHash: {
      type: String,
      default: '0000000000000000000000000000000000000000000000000000000000000000',
    },
    lockTick: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LedgerChainState', ledgerChainStateSchema);
