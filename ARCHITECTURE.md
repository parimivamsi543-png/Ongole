# ARCHITECTURE.md – System Design, Database Schema & API Reference

**Project:** LedgerLine – Secure Financial Ledger System  
**Stack:** React (Vite + Tailwind CSS) · Node.js + Express · MongoDB Atlas (Replica Set)  

---

## 1. Architectural Overview & Design Decisions

LedgerLine separates financial truth from account summary state while binding them together atomically:

1. **Double-Entry Source of Truth (`LedgerEntry`)**:
   - Account balances are not arbitrary mutable counters—every dollar movement requires a balanced pair of immutable journal entries (`DEBIT` and `CREDIT`).
   - Deposits draw from institutional clearing (`SYS-CLEARING-001`) and credit the customer account; withdrawals debit the customer account and credit `SYS-CLEARING-001`; transfers debit the sender and credit the recipient.
   - Because every posting creates an equal Debit and Credit, the total sum of balances across all accounts (Customer + System Clearing) is strictly conserved at **$0.00**.

2. **ACID Atomicity + Optimistic Concurrency Control (OCC)**:
   - Every financial transaction runs inside a MongoDB Replica Set multi-document transaction (`session.startTransaction()`).
   - `Account` documents maintain a monotonic `version` field. Updates assert `{ _id, version, balance }` so concurrent modifications abort immediately rather than causing lost updates.
   - `LedgerChainState` acts as a serialized write-lock anchor inside the ACID transaction so concurrent transactions on different accounts never collide on `sequenceNumber` or fork the SHA-256 `previousHash` chain.
   - Transient MongoDB `WriteConflict` (`TransientTransactionError`) errors are retried with randomized exponential backoff (`15ms–250ms`), guaranteeing deterministic resolution under burst concurrency.

3. **Cryptographic Tamper-Evident Chain**:
   - Each `LedgerEntry` links to its predecessor via `previousHash` and seals its own fields (`sequenceNumber`, `entryId`, `transactionId`, `accountId`, `entryType`, `amount`, `balanceAfter`, `previousHash`, `createdAt`) using **SHA-256**.
   - Modifying even `$0.01` directly in MongoDB breaks both the entry's SHA-256 signature and every downstream hash link, immediately caught by `verifySystemIntegrity()`.

4. **Idempotency Barrier**:
   - `handleIdempotency` intercepts mutating requests carrying `Idempotency-Key`.
   - It computes a recursive canonical SHA-256 hash (`canonicalize(payload)`) and acquires an atomic lock record (`IdempotencyRecord`) before invoking controllers.
   - Identical retries return the exact persisted HTTP code and JSON body with header `Idempotent-Replay: true`. Reusing a key with altered parameters returns `409 Conflict`.

---

## 2. Database Schema Documentation

### `users` (`server/src/models/User.js`)
| Field | Type | Constraints / Notes |
| --- | --- | --- |
| `fullName` | String | Required |
| `email` | String | Required, Unique, Lowercase |
| `password` | String | Required, bcrypt hashed (`select: false`) |
| `role` | Enum | `ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR` |
| `isActive` | Boolean | Default `true` |

### `accounts` (`server/src/models/Account.js`)
| Field | Type | Constraints / Notes |
| --- | --- | --- |
| `accountNumber` | String | Required, Unique, Uppercase (e.g., `ACC-2026-10001`) |
| `name` | String | Required |
| `ownerId` | ObjectId (User) | `null` for system clearing/reserve accounts |
| `accountType` | Enum | `CHECKING`, `SAVINGS`, `SYSTEM_CLEARING`, `SYSTEM_RESERVE` |
| `balance` | Number | Rounded to 2 decimals; starts at `0` |
| `overdraftLimit` | Number | Default `0`, min `0` (Admin-authorized only) |
| `status` | Enum | `ACTIVE`, `FROZEN`, `CLOSED` |
| `version` | Number | OCC monotonic counter |
| `isSystem` | Boolean | Default `false` |

### `transactions` (`server/src/models/Transaction.js`)
| Field | Type | Constraints / Notes |
| --- | --- | --- |
| `transactionId` | String (UUID) | Unique |
| `idempotencyKey` | String | Unique, Sparse (omitted when absent) |
| `type` | Enum | `DEPOSIT`, `WITHDRAWAL`, `TRANSFER` |
| `amount` | Number | `>= 0.01` |
| `sourceAccountId` | ObjectId (Account) | Debited account |
| `destinationAccountId` | ObjectId (Account) | Credited account |
| `actorId` | ObjectId (User) | Authenticated actor responsible |
| `status` | Enum | `PENDING`, `POSTED`, `REJECTED`, `FAILED` |
| `failureReason` | String | Populated for refused/failed attempts |
| `postedAt` | Date | Settlement timestamp |

### `ledgerentries` (`server/src/models/LedgerEntry.js`) — Append-Only
| Field | Type | Constraints / Notes |
| --- | --- | --- |
| `entryId` | String (UUID) | Unique |
| `transactionId` | ObjectId (Transaction) | Indexed |
| `accountId` | ObjectId (Account) | Indexed |
| `entryType` | Enum | `DEBIT`, `CREDIT` |
| `amount` | Number | `>= 0.01` |
| `balanceAfter` | Number | Account balance immediately following entry |
| `sequenceNumber` | Number | Unique monotonic integer (`1, 2, 3...`) |
| `previousHash` | String | SHA-256 hash of `sequenceNumber - 1` |
| `hash` | String | SHA-256 digest of entry payload |

### `auditlogs` (`server/src/models/AuditLog.js`) & `idempotencyrecords` (`server/src/models/IdempotencyRecord.js`)
- `AuditLog`: records `actorId`, `actorEmail`, `actorRole`, `action`, `targetResource`, `targetId`, `outcome` (`SUCCESS`, `REFUSED`, `FAILED`, `BLOCKED`), `reason`, `ipAddress`, `userAgent`, `details`.
- `IdempotencyRecord`: stores `key` (unique), `requestHash`, `status` (`IN_PROGRESS`, `COMPLETED`, `FAILED`), `responseCode`, `responseBody`, and 24-hour TTL (`expiresAt`).

---

## 3. Complete API Documentation

Base URL: `/api` (All protected endpoints require `Authorization: Bearer <jwt_token>`).

### Authentication (`/api/auth`)
- `POST /api/auth/login` — Body: `{ email, password }`. Returns `{ token, user }`.
- `POST /api/auth/register` — Body: `{ fullName, email, password }`. Creates `ACCOUNT_HOLDER` user.
- `GET /api/auth/me` — Returns current authenticated profile.

### Accounts (`/api/accounts`)
- `GET /api/accounts/my` — Returns accounts owned by `req.user`.
- `GET /api/accounts/directory` — Returns non-sensitive active customer accounts (excludes balances) for transfer target selection.
- `GET /api/accounts/users` *(ADMIN only)* — Lists all system users.
- `GET /api/accounts` *(ADMIN, AUDITOR)* — Lists all customer & system accounts with balances.
- `GET /api/accounts/:id` *(Owner, ADMIN, AUDITOR)* — Single account inspection.
- `POST /api/accounts` *(ADMIN, ACCOUNT_HOLDER)* — Creates zero-balance account.
- `PATCH /api/accounts/:id/status` *(ADMIN only)* — Body: `{ status: "ACTIVE" | "FROZEN" | "CLOSED" }`.
- `PATCH /api/accounts/:id/overdraft` *(ADMIN only)* — Body: `{ overdraftLimit, justification }`.

### Financial Transactions (`/api/transactions`)
Supports optional/recommended header `Idempotency-Key: <uuid>`.
- `GET /api/transactions` — Lists transactions (scoped to owned accounts for `ACCOUNT_HOLDER`; global for `ADMIN`/`AUDITOR`). Query: `type`, `status`, `limit`, `page`.
- `GET /api/transactions/:transactionId` — Returns transaction header + balanced double-entry `ledgerEntries`.
- `POST /api/transactions/deposit` *(ADMIN, ACCOUNT_HOLDER)* — Body: `{ destinationAccountId, amount, description }`.
- `POST /api/transactions/withdraw` *(ADMIN, ACCOUNT_HOLDER)* — Body: `{ sourceAccountId, amount, description }`.
- `POST /api/transactions/transfer` *(ADMIN, ACCOUNT_HOLDER)* — Body: `{ sourceAccountId, destinationAccountId, amount, description }`.
- `PUT | PATCH | DELETE /api/transactions/*` — Strictly blocked with `405 LEDGER_APPEND_ONLY_VIOLATION`.

### Statements (`/api/statements`)
- `GET /api/statements/:accountId` *(Owner, ADMIN, AUDITOR)* — Query: `startDate`, `endDate`. Returns chronological statement including `POSTED` and `REJECTED`/`FAILED` entries, running balances, timestamps, and actor metadata.

### Audit & Cryptographic Integrity (`/api/audit`) — *(ADMIN, AUDITOR only)*
- `GET /api/audit/logs` — Query: `outcome`, `action`, `targetResource`, `limit`, `page`.
- `GET /api/audit/ledger-entries` — Paginated raw SHA-256 hash-chained `LedgerEntry` stream.
- `GET /api/audit/integrity` — Executes full mathematical & cryptographic chain audit.

### Adversarial Testing Lab (`/api/adversarial`)
- `POST /api/adversarial/concurrency` *(ADMIN, ACCOUNT_HOLDER)* — Fires N simultaneous withdrawals (`{ accountId, count, amount }`).
- `POST /api/adversarial/idempotency` *(ADMIN, ACCOUNT_HOLDER)* — Fires 5 duplicate key requests (`{ accountId, amount }`).
- `POST /api/adversarial/overdraft` *(ADMIN, ACCOUNT_HOLDER)* — Tests excessive withdrawal refusal.
- `POST /api/adversarial/unauthorized-transfer` — Tests cross-account access denial & audit logging.
- `POST /api/adversarial/tamper-check` — Runs live integrity check.
- `POST /api/adversarial/tamper-simulate` — Simulates schema immutability block + `$0.01` hash mismatch detection non-destructively.

---

## 4. Local Setup Instructions

```bash
# 1. Install backend and frontend dependencies
npm run install:all

# 2. Configure environment variables
cp .env.example server/.env
# Edit server/.env and set MONGODB_URI & JWT_SECRET

# 3. Seed database with users, accounts, and balanced sample ledger entries
npm run seed

# 4. Run automated security & financial integrity test suite
npm test

# 5. Start development servers (in two terminals) or production single server
npm run dev:server   # Terminal 1 (Express API on :5000)
npm run dev:client   # Terminal 2 (Vite React on :5173)

# Or build & run single production server:
npm run build
npm start
```
