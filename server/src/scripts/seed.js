const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const LedgerChainState = require('../models/LedgerChainState');
const AuditLog = require('../models/AuditLog');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const {
  ROLES,
  ACCOUNT_TYPES,
  ACCOUNT_STATUS,
  TRANSACTION_TYPES,
  SYSTEM_ACCOUNTS,
} = require('../config/constants');
const { executeFinancialTransaction, getOrCreateSystemAccount } = require('../services/ledgerService');
const { verifySystemIntegrity } = require('../services/integrityService');

const seedDatabase = async () => {
  try {
    await connectDB();
    console.log('[Seed] Clearing existing collections...');

    // Clean existing collections directly via MongoDB collection driver to bypass LedgerEntry immutability hooks during reset
    const db = mongoose.connection.db;
    const collections = ['users', 'accounts', 'transactions', 'ledgerentries', 'ledgerchainstates', 'auditlogs', 'idempotencyrecords'];
    for (const colName of collections) {
      const exists = await db.listCollections({ name: colName }).hasNext();
      if (exists) {
        await db.collection(colName).deleteMany({});
      }
    }

    console.log('[Seed] Creating seeded users...');
    const admin = await User.create({
      fullName: 'Elena Vance (Chief Admin)',
      email: 'admin@ledgerline.io',
      password: 'Admin@123456',
      role: ROLES.ADMIN,
    });

    const alex = await User.create({
      fullName: 'Alex Mercer',
      email: 'alex.holder@ledgerline.io',
      password: 'Holder@123456',
      role: ROLES.ACCOUNT_HOLDER,
    });

    const sarah = await User.create({
      fullName: 'Sarah Smith',
      email: 'sarah.smith@ledgerline.io',
      password: 'Holder@123456',
      role: ROLES.ACCOUNT_HOLDER,
    });

    const auditor = await User.create({
      fullName: 'Marcus Thorne (Lead Auditor)',
      email: 'auditor@ledgerline.io',
      password: 'Auditor@123456',
      role: ROLES.AUDITOR,
    });

    console.log('[Seed] Initializing System Clearing & Reserve accounts...');
    await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.CLEARING);
    await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.RESERVE);

    console.log('[Seed] Creating customer accounts (zero initial balance, funded strictly via double-entry)...');
    const alexChecking = await Account.create({
      accountNumber: 'ACC-2026-10001',
      name: 'Alex Primary Checking',
      ownerId: alex._id,
      accountType: ACCOUNT_TYPES.CHECKING,
      balance: 0,
      overdraftLimit: 0,
      status: ACCOUNT_STATUS.ACTIVE,
    });

    const alexSavings = await Account.create({
      accountNumber: 'ACC-2026-10002',
      name: 'Alex High-Yield Vault',
      ownerId: alex._id,
      accountType: ACCOUNT_TYPES.SAVINGS,
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

    const sarahReserve = await Account.create({
      accountNumber: 'ACC-2026-20002',
      name: 'Sarah Commercial Reserve (Overdraft Enabled)',
      ownerId: sarah._id,
      accountType: ACCOUNT_TYPES.SAVINGS,
      balance: 0,
      overdraftLimit: 500, // Explicitly authorized $500 overdraft facility
      status: ACCOUNT_STATUS.ACTIVE,
    });

    console.log('[Seed] Executing balanced double-entry transactions...');
    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.DEPOSIT,
      amount: 5000,
      actorId: admin._id,
      actorEmail: admin.email,
      actorRole: admin.role,
      destinationAccountId: alexChecking._id,
      description: 'Initial Payroll Wire Deposit',
      idempotencyKey: 'seed-tx-001',
    });

    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.DEPOSIT,
      amount: 12000,
      actorId: alex._id,
      actorEmail: alex.email,
      actorRole: alex.role,
      destinationAccountId: alexSavings._id,
      description: 'Treasury Reserve Allocation',
      idempotencyKey: 'seed-tx-002',
    });

    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.DEPOSIT,
      amount: 3500,
      actorId: admin._id,
      actorEmail: admin.email,
      actorRole: admin.role,
      destinationAccountId: sarahChecking._id,
      description: 'Opening Capital Deposit',
      idempotencyKey: 'seed-tx-003',
    });

    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.WITHDRAWAL,
      amount: 450,
      actorId: alex._id,
      actorEmail: alex.email,
      actorRole: alex.role,
      sourceAccountId: alexChecking._id,
      description: 'ATM Cash Settlement',
      idempotencyKey: 'seed-tx-004',
    });

    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.TRANSFER,
      amount: 750,
      actorId: alex._id,
      actorEmail: alex.email,
      actorRole: alex.role,
      sourceAccountId: alexChecking._id,
      destinationAccountId: sarahChecking._id,
      description: 'Invoice #4092 Consulting Settlement',
      idempotencyKey: 'seed-tx-005',
    });

    // Demonstrate refused attempt recorded on statement & audit log
    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.WITHDRAWAL,
      amount: 95000,
      actorId: alex._id,
      actorEmail: alex.email,
      actorRole: alex.role,
      sourceAccountId: alexChecking._id,
      description: 'Excessive Unfunded Withdrawal Probe',
      idempotencyKey: 'seed-tx-006-refused',
    });

    // Authorized overdraft test on Sarah's Reserve
    await executeFinancialTransaction({
      type: TRANSACTION_TYPES.DEPOSIT,
      amount: 1000,
      actorId: sarah._id,
      actorEmail: sarah.email,
      actorRole: sarah.role,
      destinationAccountId: sarahReserve._id,
      description: 'Commercial Escrow Deposit',
      idempotencyKey: 'seed-tx-007',
    });

    const integrity = await verifySystemIntegrity(auditor);
    console.log('[Seed] Cryptographic & Mathematical Integrity Check:');
    console.log(JSON.stringify(integrity, null, 2));

    if (!integrity.isMathematicallySound) {
      throw new Error('Seed verification failed integrity invariants!');
    }

    console.log('\n[Seed] Database seeded successfully!');
    console.log('----------------------------------------------------');
    console.log('Seeded Credentials:');
    console.log(`  ADMIN:          admin@ledgerline.io / Admin@123456`);
    console.log(`  ACCOUNT_HOLDER: alex.holder@ledgerline.io / Holder@123456`);
    console.log(`  ACCOUNT_HOLDER: sarah.smith@ledgerline.io / Holder@123456`);
    console.log(`  AUDITOR:        auditor@ledgerline.io / Auditor@123456`);
    console.log('----------------------------------------------------');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedDatabase();
