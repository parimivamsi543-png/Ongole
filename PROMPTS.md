# PROMPTS.md – AI-Assisted Engineering Log

This document records key dated prompts and architectural iterations used during the design, hardening, testing, and verification of **LedgerLine**.

---

## Prompt 1 — Core Double-Entry & Balance Conservation Architecture
- **Date:** `2026-11-11`
- **Category:** Financial Integrity & Data Modeling
- **Prompt:**
  > Design the MongoDB/Mongoose schema and service layer (`ledgerService.js`) for a double-entry financial ledger system. Every deposit, withdrawal, and transfer must produce strictly balanced `DEBIT` and `CREDIT` `LedgerEntry` records inside an atomic MongoDB transaction, enforce zero-sum balance conservation via an institutional clearing account (`SYS-CLEARING-001`), prevent negative balances unless an authorized overdraft limit is documented, and guarantee append-only immutability.
- **Outcome & Verification:**
  - Implemented `Account`, `Transaction`, and `LedgerEntry` schemas (`server/src/models/`).
  - Enforced `debitEntry.amount === creditEntry.amount` and `availableBalance = balance + overdraftLimit >= amount` inside `session.startTransaction()`.
  - Added Mongoose pre-hooks blocking `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, and `findOneAndUpdate` on `LedgerEntry`.

---

## Prompt 2 — Concurrency Safety, WriteConflict Retry, & Sequence Locking
- **Date:** `2026-11-11`
- **Category:** Concurrency & Race Condition Mitigation
- **Prompt:**
  > Analyze `executeFinancialTransaction` under simultaneous burst withdrawals (`Promise.all`) targeting the same account or concurrent transactions generating `LedgerEntry.sequenceNumber`. Prevent race conditions, double spending, and `E11000` sequence collisions by adding Optimistic Concurrency Control (`version` + `balance` matching), an exclusive `LedgerChainState` singleton lock inside the MongoDB session, and transient `WriteConflict` retry backoff. Also fix Mongoose `sparse: true` duplicate `null` errors on `idempotencyKey`.
- **Outcome & Verification:**
  - Added `LedgerChainState` singleton document lock inside MongoDB transactions so `sequenceNumber` and `previousHash` remain strictly monotonic across parallel requests.
  - Wrapped `attemptTransactionOnce` with `isRetryableError` exponential jittered backoff (up to 25 retries).
  - Verified with `server/tests/concurrency.test.js` (12 simultaneous `$25` withdrawals on a `$75` balance: 3 succeed, 9 refuse, final balance `$0.00`).

---

## Prompt 3 — Idempotency Middleware & Canonical Payload Tamper Detection
- **Date:** `2026-11-11`
- **Category:** Idempotency & Replay Safety
- **Prompt:**
  > Implement an Express idempotency middleware (`server/src/middleware/idempotency.js`) backed by an `IdempotencyRecord` collection with a 24h TTL. Ensure repeated requests with the same `Idempotency-Key` and identical payload return the original HTTP status and response with `Idempotent-Replay: true` without re-posting, concurrent identical keys return `409 Conflict`, and reusing a key with an altered nested body field is detected via recursive canonical SHA-256 hashing and rejected. Persist the completed `IdempotencyRecord` synchronously before transmitting the HTTP response.
- **Outcome & Verification:**
  - Replaced top-level `JSON.stringify` replacer key-array bug with recursive `canonicalize()` so nested fields (`amount`, `destinationAccountId`) affect the SHA-256 payload digest.
  - Updated `res.json` wrapper to persist `COMPLETED` status before flushing the HTTP response.
  - Verified in `server/tests/idempotency.test.js`.

---

## Prompt 4 — Server-Side RBAC, Ownership Isolation, & Auditability
- **Date:** `2026-11-11`
- **Category:** Authorization & Audit Logging
- **Prompt:**
  > Enforce server-side authorization across `ADMIN`, `ACCOUNT_HOLDER`, and `AUDITOR` roles. Ensure `AUDITOR` has full read access to accounts, statements, audit logs, and cryptographic verification, while blocking all mutating endpoints (`403`). Ensure `ACCOUNT_HOLDER` can only view statements or initiate withdrawals/transfers from accounts they own, expose a non-sensitive `/api/accounts/directory` (excluding balances) for transfer recipients, and record both accepted and refused attempts in `Transaction` and `AuditLog`.
- **Outcome & Verification:**
  - Built `requireRole` and `requireAccountOwnership` in `server/src/middleware/rbac.js`.
  - Recorded `REJECTED` transactions in `Account Statements` with `actor` attribution and `failureReason`.
  - Verified across 4 test cases in `server/tests/authorization.test.js`.

---

## Prompt 5 — SHA-256 Hash Chain Verification & Adversarial Tamper Testing
- **Date:** `2026-11-11`
- **Category:** Cryptographic Integrity & Adversarial Testing
- **Prompt:**
  > Build `integrityService.js` to audit the entire ledger from `sequenceNumber: 1` by verifying `previousHash` links, recomputing SHA-256 entry hashes, verifying per-transaction and global `Debits == Credits`, and reconciling recomputed ledger balances against `Account.balance`. Write automated tests (`tampering.test.js`) proving HTTP `PUT/PATCH/DELETE` blocks (`405`), Mongoose hook rejections, and out-of-band raw MongoDB tampering detection.
- **Outcome & Verification:**
  - Built `server/src/services/integrityService.js` and `server/src/scripts/verifyIntegrity.js`.
  - Verified in `server/tests/tampering.test.js` (all 13 automated tests across 5 suites pass).

---

## Prompt 6 — Vibrant Tailwind CSS Frontend, Adversarial Lab, & Render Deployment
- **Date:** `2026-11-11`
- **Category:** UI/UX & Production Deployment
- **Prompt:**
  > Create a vibrant dark-mode fintech React + Tailwind CSS frontend featuring role-tailored dashboards, 1-click demo credential login pills, a Double-Entry Journal Inspector modal, printable/exportable account statements with refused attempt visibility, an interactive Adversarial Testing Lab UI, and a single-service Render deployment pipeline where Express serves the compiled Vite bundle alongside `/api/*` using MongoDB Atlas (`ipv4first`).
- **Outcome & Verification:**
  - Built `client/src/` with Tailwind CSS, Lucide icons, and Vite production build targeting `server/public`.
  - Added `dns.setDefaultResultOrder('ipv4first')` + `family: 4` resolving Windows Node 20 Atlas SRV latency (connecting in ~426ms).
  - Verified full production server (`npm run build` + `npm start`) serving both SPA and API health/login/accounts endpoints.

