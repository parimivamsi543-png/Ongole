const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { logAudit } = require('./services/auditService');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const statementRoutes = require('./routes/statementRoutes');
const auditRoutes = require('./routes/auditRoutes');
const adversarialRoutes = require('./routes/adversarialRoutes');

const app = express();

// Trust proxy for accurate IP logging behind Render reverse proxy
app.set('trust proxy', 1);

// Security & middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.CLIENT_URL || true : true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['Idempotent-Replay', 'X-Idempotency-Key'],
  })
);
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate limiter (tuned to allow adversarial bursts while protecting API)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again shortly.' },
});
app.use('/api', apiLimiter);

// Health endpoint for Render zero-downtime health checks
app.get('/api/health', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    service: 'LedgerLine Secure Financial Ledger API',
    status: dbReady ? 'HEALTHY' : 'DEGRADED',
    database: dbReady ? 'CONNECTED' : 'DISCONNECTED',
    timestamp: new Date().toISOString(),
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/adversarial', adversarialRoutes);

// Explicit Append-Only Ledger Guard: reject any PUT/PATCH/DELETE on transactions or ledger
app.all(['/api/transactions/*', '/api/audit/ledger-entries*'], (req, res, next) => {
  if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    logAudit({
      action: 'LEDGER_MUTATION_ATTEMPT',
      targetResource: req.originalUrl,
      outcome: 'BLOCKED',
      reason: `Blocked ${req.method} attempt against append-only financial ledger.`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(405).json({
      success: false,
      error: 'LEDGER_APPEND_ONLY_VIOLATION',
      message: 'Financial ledger records are strictly append-only and immutable. Modification or deletion is forbidden.',
    });
  }
  next();
});

// Serve React Frontend in production / single-service Render deployment
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ success: false, error: 'API_ROUTE_NOT_FOUND' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      service: 'LedgerLine API',
      status: 'running',
      docs: '/api/health',
    });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('[LedgerLine Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.',
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LedgerLine] Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  connectDB().catch((err) => {
    console.error('[LedgerLine] Exhausted MongoDB connection retries:', err.message);
    process.exit(1);
  });
}

module.exports = { app };

