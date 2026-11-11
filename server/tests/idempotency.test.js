const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Account = require('../src/models/Account');
const Transaction = require('../src/models/Transaction');
const {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
} = require('./testHelper');

describe('Idempotency & Replay Attack Prevention', () => {
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
      fullName: 'Alice Idempotent',
      email: 'alice.idem@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    aliceAcc = await createAccountForUser(aliceAuth.user._id, { name: 'Alice Idem Account' });
  });

  it('returns original outcome on duplicate Idempotency-Key without creating duplicate financial postings', async () => {
    const key = 'idem-deposit-unique-key-1';
    const payload = { destinationAccountId: aliceAcc._id.toString(), amount: 250, description: 'Wire #1' };

    // 1st request: Executes and posts transaction
    const res1 = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('idempotent-replay'), null);
    const body1 = await res1.json();
    assert.equal(body1.success, true);

    // 2nd & 3rd requests (replays): Must return cached response and NOT double credit
    for (let i = 0; i < 3; i++) {
      const replayRes = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceAuth.token}`,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(replayRes.status, 200);
      assert.equal(replayRes.headers.get('idempotent-replay'), 'true');
      const replayBody = await replayRes.json();
      assert.equal(replayBody.transactionId, body1.transactionId);
    }

    // Verify account balance was credited ONLY ONCE ($250, not $1000)
    const freshAcc = await Account.findById(aliceAcc._id);
    assert.equal(freshAcc.balance, 250);

    // Verify only 1 transaction exists in DB
    const txCount = await Transaction.countDocuments();
    assert.equal(txCount, 1);
  });

  it('rejects Idempotency-Key reuse when request payload is altered (409 Conflict)', async () => {
    const key = 'idem-tamper-key-2';

    const res1 = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id.toString(), amount: 100 }),
    });
    assert.equal(res1.status, 200);

    // Replay with same key but different amount ($999)
    const res2 = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id.toString(), amount: 999 }),
    });
    assert.equal(res2.status, 409);
    const errBody = await res2.json();
    assert.equal(errBody.error, 'IDEMPOTENCY_CONFLICT');

    const freshAcc = await Account.findById(aliceAcc._id);
    assert.equal(freshAcc.balance, 100);
  });
});
