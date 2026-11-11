# DEPLOYMENT.md – Render & MongoDB Atlas Production Deployment

**LedgerLine** is packaged as a unified single-service web application: the root `npm run build` installs backend and frontend dependencies and compiles the React + Tailwind CSS production bundle directly into `server/public/`, which Express serves alongside `/api/*` from a single port (`process.env.PORT`).

---

## 1. Prerequisites

1. **GitHub Repository:** Push this codebase to your public GitHub repository (`git push origin main`). Ensure `server/.env` is **never** committed (`.gitignore` excludes it).
2. **MongoDB Atlas Cluster:**
   - Ensure Network Access in MongoDB Atlas allows connections from Render (e.g., `0.0.0.0/0` or Render's outbound IPs) since Render's free/starter services use dynamic outbound IPs.
   - Use an SRV connection string specifying the database name:
     `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ledgerline?retryWrites=true&w=majority`

---

## 2. Option A — 1-Click Deployment via Render Blueprint (`render.yaml`)

This repository includes a `render.yaml` Blueprint at the project root:

```yaml
services:
  - type: web
    name: ledgerline
    runtime: node
    plan: free
    buildCommand: npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRES_IN
        value: 24h
```

### Steps:
1. Log into [Render Dashboard](https://dashboard.render.com).
2. Click **New + → Blueprint**.
3. Connect your GitHub repository containing LedgerLine.
4. Render automatically detects `render.yaml` and prompts you to enter `MONGODB_URI`.
5. Paste your MongoDB Atlas URI and click **Apply**.
6. Wait ~2 minutes for `npm run build` and `npm start` to complete.
7. Render runs health checks against `/api/health` and marks the live URL ready!

---

## 3. Option B — Manual Render Web Service Setup

1. Click **New + → Web Service** and link your GitHub repository.
2. Configure:
   - **Runtime:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. Add **Environment Variables**:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `mongodb+srv://...`
   - `JWT_SECRET` = `<strong-random-64-char-string>`
   - `JWT_EXPIRES_IN` = `24h`
4. Click **Create Web Service**.

---

## 4. Seeding & Verifying the Production Database

Once `MONGODB_URI` is pointed at your Atlas cluster, seed initial roles and balanced ledger accounts from local CLI or Render Shell:

```bash
# Seed users, clearing/reserve accounts, and initial balanced transactions
npm run seed

# Independently verify SHA-256 hash chain & Debits == Credits invariants
npm run verify
```

Verify live health check:
```bash
curl https://<your-render-app>.onrender.com/api/health
```
Expected response (`200 OK`):
```json
{
  "success": true,
  "service": "LedgerLine Secure Financial Ledger API",
  "status": "HEALTHY",
  "database": "CONNECTED"
}
```

