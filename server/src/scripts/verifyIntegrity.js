const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { verifySystemIntegrity } = require('../services/integrityService');

const runVerification = async () => {
  try {
    await connectDB();
    const report = await verifySystemIntegrity();

    console.log('\n=== LEDGERLINE INTEGRITY VERIFICATION REPORT ===');
    console.log(`Timestamp:               ${report.timestamp}`);
    console.log(`Total Transactions:      ${report.totalTransactions}`);
    console.log(`Total Ledger Entries:    ${report.totalLedgerEntries}`);
    console.log(`Total Debits:            ₹${report.totalDebits.toFixed(2)}`);
    console.log(`Total Credits:           ₹${report.totalCredits.toFixed(2)}`);
    console.log(`Hash Chain Intact:       ${report.isHashChainIntact ? 'PASS' : 'FAIL'}`);
    console.log(`Double-Entry Balanced:   ${report.isDoubleEntryBalanced ? 'PASS' : 'FAIL'}`);
    console.log(`Balances Reconciled:     ${report.isAccountBalanceReconciled ? 'PASS' : 'FAIL'}`);
    console.log(`Overall Mathematically Sound: ${report.isMathematicallySound ? 'YES [VERIFIED]' : 'NO [VIOLATION]'}`);

    if (report.discrepancies.length > 0) {
      console.error('\nDiscrepancies Detected:');
      console.error(JSON.stringify(report.discrepancies, null, 2));
    }

    await mongoose.disconnect();
    process.exit(report.isMathematicallySound ? 0 : 1);
  } catch (err) {
    console.error('Verification error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runVerification();

