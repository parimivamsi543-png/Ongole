# THREATS.md – Security Threat Model & Mitigations

**System:** LedgerLine – Secure Financial Ledger System  
**Methodology:** STRIDE + Financial Integrity Threat Vectors  

---

## 1. Threat Overview & Trust Boundaries

LedgerLine enforces zero-trust boundaries at the server layer (`server/src/middleware/` and `server/src/services/`). No balance calculation, permission check, or idempotency guarantee is ever trusted from client inputs.

```
[Browser / Attacker Client]
       │ (HTTPS + JWT + Idempotency-Key)
       ▼
[Express Security Layer] ──► Helmet, CORS, Rate Limiting, JWT Verification, RBAC Middleware
       │
       ▼
[Idempotency Barrier]    ──► Canonical SHA-256 Request Hashing + Atomic Lock (IdempotencyRecord)
       │
       ▼
[ACID Ledger Engine]     ──► MongoDB Replica Set Session + OCC Version Check + LedgerChainState Lock
       │
       ▼
[Immutable Storage]      ──► Append-Only LedgerEntry (SHA-256 Hash Chain) + AuditLog
```

---

## 2. Detailed Threat Matrix & Implemented Mitigations

### Threat 1: Race Conditions & Double-Spending (Concurrency Attack)
- **Attack Vector:** An adversary scripts 10–25 concurrent `POST /api/transactions/withdraw` requests targeting a single account with `$75.00` balance, attempting to pass simultaneous balance checks before debits settle.
- **Impact:** Account drops into unauthorized negative balance; money is created out of thin air.
- **Mitigation Implemented:**
  - All financial writes execute inside **MongoDB Multi-Document ACID Transactions** (`session.startTransaction()` in `server/src/services/ledgerService.js`).
  - **Optimistic Concurrency Control (OCC)** updates accounts with conditional matching `{ _id, version, balance }`, incrementing `version` atomically.
  - **Exclusive Ledger Chain Serialization:** `LedgerChainState` singleton lock ensures concurrent transactions acquire deterministic write locks and serialize cleanly via jittered retry (`isRetryableError`).
  - **Negative Balance Guard:** `availableBalance = balance + overdraftLimit` is verified inside the snapshot transaction before posting.
- **Verification:** `server/tests/concurrency.test.js` fires 12 simultaneous withdrawals of `$25` against `$75`; strictly 3 succeed, 9 are refused, and final balance is exactly `$0.00`.

---

### Threat 2: Duplicate Transaction Submissions & Idempotency-Key Replay / Tampering
- **Attack Vector:**
  1. Network timeout triggers client retries causing duplicate transfers or deposits.
  2. Attacker intercepts an `Idempotency-Key` and replays it with an altered payload (e.g., changing `amount` from `$10` to `$10,000`).
- **Impact:** Unintended double-debit/double-credit or payload tampering under a valid key.
- **Mitigation Implemented:**
  - `server/src/middleware/idempotency.js` enforces an atomic unique lock on `IdempotencyRecord.key` (`unique: true`).
  - Requests are hashed via recursive canonical SHA-256 (`canonicalize` + `hashPayload` covering endpoint, userId, and normalized body).
  - Exact replays return the persisted response with header `Idempotent-Replay: true` without touching the ledger.
  - Reusing an existing `Idempotency-Key` with a modified payload triggers **409 Conflict (`IDEMPOTENCY_CONFLICT`)** and logs an `IDEMPOTENCY_TAMPER_ATTEMPT` in `AuditLog`.
- **Verification:** `server/tests/idempotency.test.js` validates replay caching and 409 payload tamper rejection.

---

### Threat 3: Cross-Account Theft & Privilege Escalation (Broken Access Control)
- **Attack Vector:**
  1. Authenticated `ACCOUNT_HOLDER` A submits `POST /api/transactions/transfer` with `sourceAccountId` belonging to `ACCOUNT_HOLDER` B.
  2. `AUDITOR` (read-only) attempts to invoke `POST /api/transactions/deposit` or `PATCH /api/accounts/:id/status`.
  3. `ACCOUNT_HOLDER` attempts to call `/api/audit/logs` or freeze another user's account.
- **Impact:** Unauthorized fund movement, privilege escalation, or PII/balance exposure.
- **Mitigation Implemented:**
  - Server-side JWT validation (`authenticateToken`) extracts trusted `req.user` directly from MongoDB.
  - Role-Based Access Control (`requireRole(...)`) protects every sensitive endpoint.
  - Ownership verification (`requireAccountOwnership` and controller checks) rejects cross-tenant access with **403 Forbidden**, and logs `UNAUTHORIZED_*_ATTEMPT` or `RBAC_VIOLATION_ATTEMPT` to `AuditLog`.
  - Transfer recipient lookup (`/api/accounts/directory`) strips sensitive balances so holders never see peers' financial standing.
- **Verification:** `server/tests/authorization.test.js`.

---

### Threat 4: Ledger Tampering & Silent History Deletion
- **Attack Vector:**
  1. Calling `DELETE`, `PUT`, or `PATCH` on `/api/transactions/*` or `/api/audit/ledger-entries` to erase or alter historical postings.
  2. Out-of-band direct database manipulation modifying an entry's `amount` or `balanceAfter`.
- **Impact:** Fraudulent balance inflation or erasure of audit trails.
- **Mitigation Implemented:**
  - **HTTP Layer:** Express append-only guard rejects `PUT`/`PATCH`/`DELETE` on ledger routes with **405 Method Not Allowed (`LEDGER_APPEND_ONLY_VIOLATION`)** and records `LEDGER_MUTATION_ATTEMPT`.
  - **ORM Layer:** `LedgerEntry.js` registers pre-hooks on `remove`, `deleteOne`, `deleteMany`, `updateOne`, `updateMany`, and `findOneAndUpdate` throwing `LEDGER_IMMUTABILITY_VIOLATION`.
  - **Cryptographic Hash Chain:** Every `LedgerEntry` calculates `SHA-256(sequenceNumber | entryId | transactionId | accountId | entryType | amount | balanceAfter | previousHash | createdAt)`. `verifySystemIntegrity()` walks the entire chain and recomputes every account's balance from entry #1.
- **Verification:** `server/tests/tampering.test.js` mutates raw MongoDB collection bytes and proves `verifySystemIntegrity()` catches `RECORD_TAMPERED` and `ACCOUNT_BALANCE_DESYNC`.

---

### Threat 5: Money Creation / Destruction (Double-Entry Imbalance)
- **Attack Vector:** Creating an account with a pre-populated arbitrary balance, or posting a single-sided deposit/withdrawal without a balancing contra-account.
- **Impact:** System-wide balance conservation violation (`Total Debits != Total Credits`).
- **Mitigation Implemented:**
  - Newly created accounts always initialize at `$0.00` balance.
  - Deposits debit institutional `SYS-CLEARING-001` and credit customer accounts; withdrawals debit customer accounts and credit `SYS-CLEARING-001`.
  - Every `executeFinancialTransaction` inserts both `DEBIT` and `CREDIT` entries atomically (`ordered: true`) inside the same transaction and verifies `debitEntry.amount === creditEntry.amount`.

---

### Threat 6: Denial of Service, Header Injection, & Brute Force
- **Mitigation Implemented:**
  - `helmet` security headers, `express.json({ limit: '1mb' })`, and `express-rate-limit` (500 req/min/IP window).
  - Passwords hashed with `bcryptjs` (salt rounds: 10) and excluded from default Mongoose projections (`select: false`) and `toJSON()`.
  - Secrets (`MONGODB_URI`, `JWT_SECRET`) managed via `.env` and excluded from version control via `.gitignore`.
