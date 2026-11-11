# DEMO.md – 5-Minute Live System Demonstration Guide

This walkthrough demonstrates LedgerLine's double-entry accounting, server-side RBAC, idempotency, concurrency safety, audit statements, and cryptographic tamper protection in 5 minutes.

---

## Minute 0:00 – 1:00 | Login & Account Holder Operations
1. Open the live URL (or `http://localhost:5000`).
2. Click the **Account Holder (Alex)** 1-click pill (`alex.holder@ledgerline.io`).
3. On the **Overview** dashboard:
   - Point out Alex's two accounts (`ACC-2026-10001` Primary Checking and `ACC-2026-10002` High-Yield Vault).
   - Click **Deposit** or **Transfer** to open the **Execute Ledger Transaction** modal.
   - Transfer `₹100.00` from Alex's Checking to Sarah's Checking (`ACC-2026-20001`), noting the auto-generated `Idempotency-Key` header.
   - After posting, immediately click **Replay Same Key** inside the modal: observe the toast confirming **Idempotent Replay Intercepted**—no duplicate debit occurs!

---

## Minute 1:00 – 2:00 | Double-Entry Inspection & Statements
1. Navigate to **Double-Entry Ledger** in the sidebar.
2. Click the newly posted transfer row to open the **Double-Entry Journal Inspector**.
   - Show the two balanced immutable postings (`DEBIT` on Alex's account, `CREDIT` on Sarah's account), `DEBITS == CREDITS VERIFIED` badge, `sequenceNumber`, `previousHash`, and `SHA-256 Hash`.
3. Navigate to **Statements** and select `ACC-2026-10001`.
   - Point out that **both** `POSTED` transactions AND the seeded `REJECTED` `₹95,000` overdraft attempt appear chronologically with running balances, timestamps, refusal reasons, and full actor attribution (`name`, `email`, `role`).
   - Show **Export CSV**, **Export JSON**, and **Print Statement** controls.

---

## Minute 2:00 – 3:15 | Live Adversarial Testing Lab
1. Navigate to **Adversarial Lab**.
2. **Test 1 — Concurrent Withdrawal Race Attack:**
   - Select Alex's Primary Checking account. Set `Parallel Threads = 10` and `Amount / Thread = 500`.
   - Click **Launch 10x Concurrent Withdrawals**.
   - Highlight telemetry: MongoDB ACID + OCC + chain lock serialized the concurrent threads cleanly—no double-spending, `raceConditionPrevented: true`, `negativeBalancePrevented: true`, `ledgerCryptographicallySound: true`.
3. **Test 2 — Overdraft Exhaustion & Unauthorized Transfer Probes:**
   - Click **Attempt Unauthorized Overdraft** → blocked cleanly with `INSUFFICIENT_FUNDS`, balance untouched.
   - Click **Launch Unauthorized Transfer Probe** → blocked at server RBAC boundary (`403`) and logged to `AuditLog`.
4. **Test 3 — Tamper Detection Simulation:**
   - Click **Run Tamper Detection Test** → shows both Mongoose schema immutability guard (`LEDGER_IMMUTABILITY_VIOLATION`) AND `₹0.01` SHA-256 hash mismatch detection.

---

## Minute 3:15 – 4:15 | Auditor Read-Only Oversight & Cryptographic Audit
1. Click **Sign Out** and log in with **Lead Auditor** (`auditor@ledgerline.io`).
2. Observe that `AUDITOR` sees system-wide accounts (including `SYS-CLEARING-001` offsetting customer balances so **Zero-Sum Net = ₹0.00**), while Deposit/Transfer/Create Account controls are completely hidden and blocked on the server (`403`).
3. Navigate to **Audit & Cryptographic Proof**:
   - Click **Run Cryptographic Audit** → confirms `SHA-256 Chain: INTACT`, `Debits == Credits`, and `100% MATCH` account reconciliation.
   - Switch between **Security Audit Events** (showing every `REFUSED` and `BLOCKED` attempt from Minute 2) and **SHA-256 Hash Chain**.

---

## Minute 4:15 – 5:00 | Admin Controls & Automated Test Suite
1. Sign out and log in as **Chief Admin** (`admin@ledgerline.io`).
2. Navigate to **Accounts**:
   - Demonstrate **Freeze** on an account and **Overdraft** configuration with documented justification.
3. Wrap up by running `npm test` and `npm run verify` in the terminal to show all **13 automated tests across 5 suites passing** with zero discrepancies.

