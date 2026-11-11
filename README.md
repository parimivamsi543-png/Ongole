# LedgerLine – Secure Financial Ledger System

**LedgerLine** is an immutable, concurrency-safe, double-entry financial ledger engineered with **React + Tailwind CSS**, **Node.js + Express**, and **MongoDB Atlas (ACID Replica Set Transactions)**.

It guarantees mathematical correctness, strict server-side Role-Based Access Control (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`), idempotent request execution, race-condition immunity under simultaneous bursts, and SHA-256 cryptographic tamper detection.

---

## Core Engineering Guarantees

1. **Double-Entry Bookkeeping**: Every deposit, withdrawal, and transfer generates strictly balanced `DEBIT` and `CREDIT` `LedgerEntry` records (`Total Debits === Total Credits`).
2. **Multi-Document ACID Atomicity**: All financial state changes commit atomically inside MongoDB Replica Set transactions (`session.startTransaction()`).
3. **Zero-Sum Balance Conservation**: Deposits and withdrawals settle against an institutional clearing account (`SYS-CLEARING-001`), ensuring net system balance always equals `$0.00`.
4. **Negative Balance Prevention**: Enforces `balance + authorizedOverdraftLimit >= amount` inside the transaction; overdrafts default to `$0.00` unless explicitly authorized and logged by an `ADMIN`.
5. **Append-Only Cryptographic Ledger**: HTTP `PUT`/`PATCH`/`DELETE` routes return `405 Method Not Allowed`, Mongoose hooks prohibit updates/deletes, and every entry chains via `SHA-256(sequenceNumber | entryId | transactionId | accountId | entryType | amount | balanceAfter | previousHash | createdAt)`.
6. **Idempotency & Concurrency Safety**: `Idempotency-Key` middleware uses recursive canonical SHA-256 payload hashing and atomic locks; Optimistic Concurrency Control (`version` checks) + `LedgerChainState` serialization + transient retry prevent double-spending under parallel load.

---

## Seeded Demo Credentials

| Role | Email | Password | Capabilities |
| --- | --- | --- | --- |
| **ADMIN** | `admin@ledgerline.io` | `Admin@123456` | Full account management, freeze/close, overdraft authorization, audit oversight |
| **ACCOUNT_HOLDER** | `alex.holder@ledgerline.io` | `Holder@123456` | Deposits, withdrawals, transfers, personal statements & adversarial testing |
| **ACCOUNT_HOLDER** | `sarah.smith@ledgerline.io` | `Holder@123456` | Checking + Commercial Reserve (`$500` authorized overdraft facility) |
| **AUDITOR** | `auditor@ledgerline.io` | `Auditor@123456` | Read-only access to all accounts, statements, audit logs & SHA-256 integrity verifier |

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies for root, server, and client
npm run install:all

# 2. Configure environment variables
cp .env.example server/.env
# Ensure MONGODB_URI in server/.env points to your MongoDB Atlas replica set

# 3. Seed database with roles, accounts, and sample double-entry transactions
npm run seed

# 4. Run full automated adversarial & integrity test suite (13 tests / 5 suites)
npm test

# 5. Independently verify cryptographic hash chain & balance reconciliation
npm run verify

# 6. Run locally in development mode (2 terminals)
npm run dev:server   # Backend API on http://localhost:5000
npm run dev:client   # Vite React UI on http://localhost:5173

# Or build & serve unified production bundle on http://localhost:5000:
npm run build
npm start
```

---

## Automated Test Suite (`server/tests/`)

- `authorization.test.js` — RBAC enforcement, `AUDITOR` read-only blocks, cross-account ownership isolation, frozen account blocks.
- `concurrency.test.js` — 12 simultaneous `$25` withdrawals racing on a `$75` balance (proves 3 succeed, 9 refuse, balance `$0.00`, zero double-spend).
- `financialIntegrity.test.js` — Double-entry conservation, negative balance prevention, statement refusal logging, authorized overdraft limits.
- `idempotency.test.js` — Duplicate `Idempotency-Key` replay caching (`Idempotent-Replay: true`) and `409` conflict on altered payloads.
- `tampering.test.js` — `405` API guards, Mongoose immutability hook enforcement, and SHA-256 hash chain tamper detection.

---

## Project Documentation Deliverables

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture, MongoDB schemas, API reference, and setup guide.
- [`THREATS.md`](./THREATS.md) — STRIDE security threat model and implemented mitigations.
- [`PROMPTS.md`](./PROMPTS.md) — Dated AI-assisted engineering prompt log covering integrity, concurrency, idempotency, and RBAC.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Render & MongoDB Atlas production deployment guide (`render.yaml`).
- [`DEMO.md`](./DEMO.md) — 5-minute live demonstration walkthrough script.
