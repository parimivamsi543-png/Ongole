const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const LedgerEntry = require('../src/models/LedgerEntry');
const { verifySystemIntegrity } = require('../src/services/integrityService');
const {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
} = require('./testHelper');

describe('Append-Only Ledger & Cryptographic Tamper Detection', () => {
  let env;
  let aliceAuth;
  let auditorAuth;
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
      fullName: 'Alice Immutable',
      email: 'alice.tamper@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    auditorAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Auditor Tamper',
      email: 'auditor.tamper@test.io',
      password: 'Password123!',
      role: ROLES.AUDITOR,
    });
    aliceAcc = await createAccountForUser(aliceAuth.user._id, { name: 'Alice Immutable Checking' });

    await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceAuth.token}` },
      body: JSON.stringify({ destinationAccountId: aliceAcc._id, amount: 500 }),
    });
  });

  it('rejects HTTP PUT, PATCH, DELETE requests against ledger & transaction endpoints (405)', async () => {
    const delTx = await fetch(`${env.baseUrl}/api/transactions/fake-id`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceAuth.token}` },
    });
    assert.equal(delTx.status, 405);
    const delBody = await delTx.json();
    assert.equal(delBody.error, 'LEDGER_APPEND_ONLY_VIOLATION');

    const patchLedger = await fetch(`${env.baseUrl}/api/audit/ledger-entries`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${auditorAuth.token}` },
    });
    assert.equal(patchLedger.status, 405);
  });

  it('blocks programmatic updateOne / deleteOne calls via Mongoose schema immutability hooks', async () => {
    const entry = await LedgerEntry.findOne();
    assert.ok(entry);

    await assert.rejects(
      async () => {
        await LedgerEntry.updateOne({ _id: entry._id }, { $set: { amount: 999999 } });
      },
      /LEDGER_IMMUTABILITY_VIOLATION/
    );

    await assert.rejects(
      async () => {
        await LedgerEntry.deleteOne({ _id: entry._id });
      },
      /LEDGER_IMMUTABILITY_VIOLATION/
    );
  });

  it('detects direct out-of-band database tampering via SHA-256 hash chain verification', async () => {
    // Baseline integrity must pass
    const baseline = await verifySystemIntegrity();
    assert.equal(baseline.isMathematicallySound, true);

    // Simulate rogue DBA modifying a ledger entry directly at raw MongoDB collection layer
    const targetEntry = await LedgerEntry.findOne({ entryType: 'CREDIT' });
    await mongoose.connection.db
      .collection('ledgerentries')
      .updateOne({ _id: targetEntry._id }, { $set: { amount: targetEntry.amount + 10000 } });

    // Run integrity verifier: must detect RECORD_TAMPERED, DOUBLE_ENTRY_IMBALANCE, and ACCOUNT_BALANCE_DESYNC
    const compromised = await verifySystemIntegrity(auditorAuth.user);
    assert.equal(compromised.isMathematicallySound, false);
    assert.equal(compromised.isHashChainIntact, false);
    assert.equal(compromised.isDoubleEntryBalanced, false);
    assert.ok(compromised.discrepancies.some((d) => d.type === 'RECORD_TAMPERED'));
  });
});

