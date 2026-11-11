const express = require('express');
const router = express.Router();
const { getAuditLogs, verifyIntegrity, getLedgerEntries } = require('../controllers/auditController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ROLES } = require('../config/constants');

router.use(authenticateToken);
router.use(requireRole(ROLES.ADMIN, ROLES.AUDITOR));

router.get('/logs', getAuditLogs);
router.get('/integrity', verifyIntegrity);
router.get('/ledger-entries', getLedgerEntries);

module.exports = router;
