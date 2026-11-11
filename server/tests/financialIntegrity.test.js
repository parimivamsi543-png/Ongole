const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Account = require('../src/models/Account');
const LedgerEntry = require('../src/models/LedgerEntry');
const { verifySystemIntegrity } = require('../src/services/integrityService');
const {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
} = require('./testHelper');

describe('Financial Integrity & Double-Entry Invariants', () => {
  let env;
  let adminAuth;
  let aliceAuth;
  let bobAuth;
  let aliceAcc;
  let bobAcc;

  before(async () => {
    env = await setupTestEnvironment();
  });

  after(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    adminAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Test Admin',
      email: 'admin@test.io',
      password: 'Password123!',
      role: ROLES.ADMIN,
    });
    aliceAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Alice Test',
      email: 'alice@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    bobAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Bob Test',
      email: 'bob@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });

    aliceAcc = await createAccountForUser(aliceAuth.user._id, { name: 'Alice Checking' });
    bobAcc = await createAccountForUser(bobAuth.user._id, { name: 'Bob Checking' });
  });

  it('enforces double-entry accounting and balance conservation across deposits, withdrawals, and transfers', async () => {
    // 1. Deposit $500 into Alice's account
    const depRes = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
        'Idempotency-Key': 'dep-alice-1',
      },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id, amount: 500, description: 'Seed deposit' }),
    });
    assert.equal(depRes.status, 200);
    const depData = await depRes.json();
    assert.equal(depData.success, true);
    assert.equal(depData.ledgerEntries.length, 2);

    // 2. Transfer $175.50 from Alice to Bob
    const trfRes = await fetch(`${env.baseUrl}/api/transactions/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
        'Idempotency-Key': 'trf-alice-bob-1',
      },
      body: JSON.stringify({
        sourceAccountId: aliceAcc._id,
        destinationAccountId: bobAcc._id,
        amount: 175.5,
        description: 'Rent share',
      }),
    });
    assert.equal(trfRes.status, 200);

    // 3. Withdraw $50 from Bob
    const wdRes = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobAuth.token}`,
        'Idempotency-Key': 'wd-bob-1',
      },
      body: JSON.stringify({ sourceAccountId: bobAcc._id, amount: 50, description: 'ATM cash' }),
    });
    assert.equal(wdRes.status, 200);

    // Check balances
    const freshAlice = await Account.findById(aliceAcc._id);
    const freshBob = await Account.findById(bobAcc._id);
    assert.equal(freshAlice.balance, 324.5);
    assert.equal(freshBob.balance, 125.5);

    // Check zero-sum balance conservation across all accounts (Customer + System Clearing)
    const allAccounts = await Account.find();
    const netSystemBalance = Math.round(allAccounts.reduce((acc, a) => acc + a.balance, 0) * 100) / 100;
    assert.equal(netSystemBalance, 0, 'Total balance across all accounts including clearing must equal zero');

    // Run cryptographic & mathematical verification
    const integrity = await verifySystemIntegrity();
    assert.equal(integrity.isMathematicallySound, true);
    assert.equal(integrity.isDoubleEntryBalanced, true);
    assert.equal(integrity.isHashChainIntact, true);
    assert.equal(integrity.totalDebits, integrity.totalCredits);
  });

  it('prevents negative balances and records refused attempts in account statements', async () => {
    // Deposit $100 to Alice
    await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id, amount: 100 }),
    });

    // Attempt to withdraw $150 (more than available $100)
    const overdraftRes = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ sourceAccountId: aliceAcc._id, amount: 150, description: 'Overdraft probe' }),
    });

    assert.equal(overdraftRes.status, 400);
    const overdraftData = await overdraftRes.json();
    assert.equal(overdraftData.success, false);
    assert.equal(overdraftData.status, 'REJECTED');
    assert.match(overdraftData.reason, /INSUFFICIENT_FUNDS/);

    // Verify balance remained $100
    const freshAlice = await Account.findById(aliceAcc._id);
    assert.equal(freshAlice.balance, 100);

    // Verify statement records BOTH the successful deposit and refused withdrawal attempt
    const stmtRes = await fetch(`${env.baseUrl}/api/statements/${aliceAcc._id}`, {
      headers: { Authorization: `Bearer ${aliceAuth.token}` },
    });
    assert.equal(stmtRes.status, 200);
    const stmtData = await stmtRes.json();
    assert.equal(stmtData.statement.summary.successfulTransactions, 1);
    assert.equal(stmtData.statement.summary.refusedAttempts, 1);
    const refusedItem = stmtData.statement.items.find((i) => i.status === 'REJECTED');
    assert.ok(refusedItem);
    assert.equal(refusedItem.actor.email, 'alice@test.io');
    assert.equal(refusedItem.runningBalance, 100);
  });

  it('permits negative balance ONLY up to explicitly authorized overdraft limit', async () => {
    // Admin authorizes $200 overdraft on Alice's account
    const odPatch = await fetch(`${env.baseUrl}/api/accounts/${aliceAcc._id}/overdraft`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAuth.token}`,
      },
      body: JSON.stringify({ overdraftLimit: 200, justification: 'Approved credit line' }),
    });
    assert.equal(odPatch.status, 200);

    // Withdraw $150 from $0 balance -> Allowed because $200 overdraft authorized
    const wdAllowed = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ sourceAccountId: aliceAcc._id, amount: 150 }),
    });
    assert.equal(wdAllowed.status, 200);

    // Withdraw another $100 (total -$250 exceeds $200 limit) -> Refused!
    const wdDenied = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ sourceAccountId: aliceAcc._id, amount: 100 }),
    });
    assert.equal(wdDenied.status, 400);

    const freshAlice = await Account.findById(aliceAcc._id);
    assert.equal(freshAlice.balance, -150);

    const integrity = await verifySystemIntegrity();
    assert.equal(integrity.isMathematicallySound, true);
  });
});

