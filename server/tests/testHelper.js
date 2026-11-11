const path = require('path');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const http = require('http');
const { app } = require('../src/server');
const User = require('../src/models/User');
const Account = require('../src/models/Account');
const Transaction = require('../src/models/Transaction');
const LedgerEntry = require('../src/models/LedgerEntry');
const LedgerChainState = require('../src/models/LedgerChainState');
const AuditLog = require('../src/models/AuditLog');
const IdempotencyRecord = require('../src/models/IdempotencyRecord');
const { ROLES, ACCOUNT_TYPES, ACCOUNT_STATUS, SYSTEM_ACCOUNTS } = require('../src/config/constants');
const { getOrCreateSystemAccount } = require('../src/services/ledgerService');

const getTestMongoUri = () => {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) throw new Error('MONGODB_URI is required to run tests.');
  return baseUri.replace('/ledgerline', '/ledgerline_test');
};

const setupTestEnvironment = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(getTestMongoUri(), {
      maxPoolSize: 30,
      family: 4,
      serverSelectionTimeoutMS: 20000,
    });
  }

  // Ensure all unique & sparse indexes are built in test db
  await Promise.all([
    User.init(),
    Account.init(),
    Transaction.init(),
    LedgerEntry.init(),
    IdempotencyRecord.init(),
  ]);

  await resetTestDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    server,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
    },
  };
};

const resetTestDatabase = async () => {
  const db = mongoose.connection.db;
  const collections = ['users', 'accounts', 'transactions', 'ledgerentries', 'ledgerchainstates', 'auditlogs', 'idempotencyrecords'];
  for (const colName of collections) {
    const exists = await db.listCollections({ name: colName }).hasNext();
    if (exists) {
      await db.collection(colName).deleteMany({});
    }
  }
  await getOrCreateSystemAccount(SYSTEM_ACCOUNTS.CLEARING);
};

const createUserAndLogin = async (baseUrl, { fullName, email, password, role }) => {
  const user = await User.create({ fullName, email, password, role });
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { user, token: data.token };
};

const createAccountForUser = async (userId, { name, accountType = ACCOUNT_TYPES.CHECKING, overdraftLimit = 0, status = ACCOUNT_STATUS.ACTIVE }) => {
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return Account.create({
    accountNumber: `ACC-TEST-${suffix}`,
    name,
    ownerId: userId,
    accountType,
    balance: 0,
    overdraftLimit,
    status,
  });
};

module.exports = {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
};
