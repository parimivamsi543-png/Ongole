const User = require('../models/User');
const Account = require('../models/Account');
const {
  ROLES,
  ACCOUNT_TYPES,
  ACCOUNT_STATUS,
  TRANSACTION_TYPES,
  SYSTEM_ACCOUNTS,
} = require('../config/constants');
const { executeFinancialTransaction, getOrCreateSystemAccount } = require('./ledgerService');

/**
 * Ensures institutional clearing accounts and official demo credentials exist
 * when starting against an unseeded or empty MongoDB database.
 */
const ensureBootstrapData = async () => {
  try {
    await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.CLEARING);
    await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.RESERVE);

    const demoSpecs = [
      { fullName: 'Elena Vance (Chief Admin)', email: 'admin@ledgerline.io', password: 'Admin@123456', role: ROLES.ADMIN },
      { fullName: 'Alex Mercer', email: 'alex.holder@ledgerline.io', password: 'Holder@123456', role: ROLES.ACCOUNT_HOLDER },
      { fullName: 'Sarah Smith', email: 'sarah.smith@ledgerline.io', password: 'Holder@123456', role: ROLES.ACCOUNT_HOLDER },
      { fullName: 'Marcus Thorne (Lead Auditor)', email: 'auditor@ledgerline.io', password: 'Auditor@123456', role: ROLES.AUDITOR },
    ];

    const createdUsers = {};
    for (const spec of demoSpecs) {
      let existing = await User.findOne({ email: spec.email });
      if (!existing) {
        existing = await User.create(spec);
        console.log(`[Bootstrap] Provisioned demo user: ${spec.email} (${spec.role})`);
      }
      createdUsers[spec.email] = existing;
    }

    // If no customer accounts exist yet, provision starter accounts & double-entry seed postings
    const customerAccountCount = await Account.countDocuments({ isSystem: false });
    if (customerAccountCount === 0) {
      const admin = createdUsers['admin@ledgerline.io'];
      const alex = createdUsers['alex.holder@ledgerline.io'];
      const sarah = createdUsers['sarah.smith@ledgerline.io'];

      const alexChecking = await Account.create({
        accountNumber: 'ACC-2026-10001',
        name: 'Alex Primary Checking',
        ownerId: alex._id,
        accountType: ACCOUNT_TYPES.CHECKING,
        balance: 0,
        overdraftLimit: 0,
        status: ACCOUNT_STATUS.ACTIVE,
      });

      const sarahChecking = await Account.create({
        accountNumber: 'ACC-2026-20001',
        name: 'Sarah Operating Checking',
        ownerId: sarah._id,
        accountType: ACCOUNT_TYPES.CHECKING,
        balance: 0,
        overdraftLimit: 0,
        status: ACCOUNT_STATUS.ACTIVE,
      });

      await executeFinancialTransaction({
        type: TRANSACTION_TYPES.DEPOSIT,
        amount: 5000,
        actorId: admin._id,
        actorEmail: admin.email,
        actorRole: admin.role,
        destinationAccountId: alexChecking._id,
        description: 'Initial Payroll Wire Deposit',
        idempotencyKey: 'bootstrap-tx-001',
      });

      await executeFinancialTransaction({
        type: TRANSACTION_TYPES.DEPOSIT,
        amount: 3500,
        actorId: admin._id,
        actorEmail: admin.email,
        actorRole: admin.role,
        destinationAccountId: sarahChecking._id,
        description: 'Opening Capital Deposit',
        idempotencyKey: 'bootstrap-tx-002',
      });

      console.log('[Bootstrap] Initialized starter customer accounts and balanced postings.');
    }
  } catch (err) {
    console.error('[Bootstrap] Non-fatal bootstrap warning:', err.message);
  }
};

module.exports = { ensureBootstrapData };

