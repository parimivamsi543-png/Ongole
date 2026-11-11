const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Account = require('../src/models/Account');
const { verifySystemIntegrity } = require('../src/services/integrityService');
const {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
} = require('./testHelper');

describe('Concurrency Safety & Double-Spending Prevention', () => {
  let env;
  let aliceAuth;
  let aliceAcc;

  before(async () => {
    env = await setupTestEnvironment();
  });

  after(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    aliceAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Alice Concurrent',
      email: 'alice.concurrent@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    aliceAcc = await createAccountForUser(aliceAuth.user._id, { name: 'Alice Race Target' });

    // Fund account with exactly $75.00
    await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id, amount: 75 }),
    });
  });

  it('prevents double spending when 12 simultaneous withdrawals of $25 target a $75 account', async () => {
    const numRequests = 12;
    const withdrawAmount = 25;

    const responses = await Promise.all(
      Array.from({ length: numRequests }).map((_, idx) =>
        fetch(`${env.baseUrl}/api/transactions/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aliceAuth.token}`,
            'Idempotency-Key': `concurrent-wd-${idx}-${Date.now()}`,
          },
          body: JSON.stringify({
            sourceAccountId: aliceAcc._id,
            amount: withdrawAmount,
            description: `Concurrent race withdrawal #${idx + 1}`,
          }),
        }).then(async (res) => ({ status: res.status, body: await res.json() }))
      )
    );

    const succeeded = responses.filter((r) => r.status === 200 && r.body.success === true);
    const rejected = responses.filter((r) => r.status === 400);

    assert.equal(succeeded.length, 3, `Expected exactly 3 withdrawals to succeed ($75 / $25), got ${succeeded.length}`);
    assert.equal(rejected.length, 9, `Expected 9 withdrawals to be rejected, got ${rejected.length}`);

    const freshAcc = await Account.findById(aliceAcc._id);
    assert.equal(freshAcc.balance, 0, 'Final account balance must be exactly $0.00');
    assert.ok(freshAcc.balance >= 0, 'Balance must never go negative');

    const integrity = await verifySystemIntegrity();
    assert.equal(integrity.isMathematicallySound, true);
    assert.equal(integrity.isHashChainIntact, true);
    assert.equal(integrity.isDoubleEntryBalanced, true);
    assert.equal(integrity.isAccountBalanceReconciled, true);
  });
});

