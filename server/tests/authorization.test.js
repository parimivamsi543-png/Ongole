const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const AuditLog = require('../src/models/AuditLog');
const {
  setupTestEnvironment,
  resetTestDatabase,
  createUserAndLogin,
  createAccountForUser,
  ROLES,
} = require('./testHelper');

describe('Role-Based Access Control (RBAC) & Account Ownership Isolation', () => {
  let env;
  let adminAuth;
  let aliceAuth;
  let bobAuth;
  let auditorAuth;
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
      fullName: 'Admin User',
      email: 'admin.rbac@test.io',
      password: 'Password123!',
      role: ROLES.ADMIN,
    });
    aliceAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Alice Holder',
      email: 'alice.rbac@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    bobAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Bob Holder',
      email: 'bob.rbac@test.io',
      password: 'Password123!',
      role: ROLES.ACCOUNT_HOLDER,
    });
    auditorAuth = await createUserAndLogin(env.baseUrl, {
      fullName: 'Auditor User',
      email: 'auditor.rbac@test.io',
      password: 'Password123!',
      role: ROLES.AUDITOR,
    });

    aliceAcc = await createAccountForUser(aliceAuth.user._id, { name: 'Alice Account' });
    bobAcc = await createAccountForUser(bobAuth.user._id, { name: 'Bob Account' });

    // Fund Bob's account with $1000
    await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobAuth.token}` },
      body: JSON.stringify({ destinationAccountId: bobAcc._id, amount: 1000 }),
    });
  });

  it('blocks unauthenticated access to protected financial routes (401)', async () => {
    const res = await fetch(`${env.baseUrl}/api/accounts/my`);
    assert.equal(res.status, 401);
  });

  it('prevents ACCOUNT_HOLDER from withdrawing or transferring from another user account (403)', async () => {
    // Alice tries to transfer $500 FROM Bob's account TO Alice's account
    const transferAttack = await fetch(`${env.baseUrl}/api/transactions/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({
        sourceAccountId: bobAcc._id,
        destinationAccountId: aliceAcc._id,
        amount: 500,
      }),
    });
    assert.equal(transferAttack.status, 403);
    const body = await transferAttack.json();
    assert.equal(body.error, 'UNAUTHORIZED_ACCOUNT_ACCESS');

    // Alice tries to withdraw from Bob's account
    const withdrawAttack = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ sourceAccountId: bobAcc._id, amount: 100 }),
    });
    assert.equal(withdrawAttack.status, 403);

    // Alice tries to read Bob's statement
    const stmtAttack = await fetch(`${env.baseUrl}/api/statements/${bobAcc._id}`, {
      headers: { Authorization: `Bearer ${aliceAuth.token}` },
    });
    assert.equal(stmtAttack.status, 403);

    // Alice tries to access admin/auditor audit logs
    const auditAttack = await fetch(`${env.baseUrl}/api/audit/logs`, {
      headers: { Authorization: `Bearer ${aliceAuth.token}` },
    });
    assert.equal(auditAttack.status, 403);

    // Verify unauthorized attempt was captured in AuditLog
    const securityLogs = await AuditLog.find({ outcome: 'REFUSED' });
    assert.ok(securityLogs.length >= 1, 'Unauthorized access attempts must be logged');
  });

  it('enforces read-only privileges for AUDITOR role while permitting full read oversight', async () => {
    // Auditor CAN read all accounts, audit logs, statements, and verify integrity
    const accountsRes = await fetch(`${env.baseUrl}/api/accounts`, {
      headers: { Authorization: `Bearer ${auditorAuth.token}` },
    });
    assert.equal(accountsRes.status, 200);

    const integrityRes = await fetch(`${env.baseUrl}/api/audit/integrity`, {
      headers: { Authorization: `Bearer ${auditorAuth.token}` },
    });
    assert.equal(integrityRes.status, 200);

    const stmtRes = await fetch(`${env.baseUrl}/api/statements/${bobAcc._id}`, {
      headers: { Authorization: `Bearer ${auditorAuth.token}` },
    });
    assert.equal(stmtRes.status, 200);

    // Auditor CANNOT initiate deposits, withdrawals, transfers, account creation, or status changes
    const depositAttempt = await fetch(`${env.baseUrl}/api/transactions/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auditorAuth.token}` },
      body: JSON.stringify({ destinationAccountId: bobAcc._id, amount: 500 }),
    });
    assert.equal(depositAttempt.status, 403);

    const statusAttempt = await fetch(`${env.baseUrl}/api/accounts/${bobAcc._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auditorAuth.token}` },
      body: JSON.stringify({ status: 'FROZEN' }),
    });
    assert.equal(statusAttempt.status, 403);
  });

  it('prevents ACCOUNT_HOLDER from freezing accounts or escalating privileges via ADMIN routes', async () => {
    const freezeRes = await fetch(`${env.baseUrl}/api/accounts/${bobAcc._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceAuth.token}` },
      body: JSON.stringify({ status: 'FROZEN' }),
    });
    assert.equal(freezeRes.status, 403);

    // Admin CAN freeze account, which blocks subsequent transactions cleanly
    const adminFreeze = await fetch(`${env.baseUrl}/api/accounts/${bobAcc._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth.token}` },
      body: JSON.stringify({ status: 'FROZEN' }),
    });
    assert.equal(adminFreeze.status, 200);

    const frozenWithdraw = await fetch(`${env.baseUrl}/api/transactions/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobAuth.token}` },
      body: JSON.stringify({ sourceAccountId: bobAcc._id, amount: 50 }),
    });
    assert.equal(frozenWithdraw.status, 400);
    const frozenData = await frozenWithdraw.json();
    assert.match(frozenData.reason, /SOURCE_ACCOUNT_INACTIVE/);
  });
});

