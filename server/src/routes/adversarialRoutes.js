const express = require('express');
const router = express.Router();
const {
  runConcurrencyAttack,
  runIdempotencyAttack,
  runOverdraftAttack,
  runTamperVerification,
  runUnauthorizedTransferAttack,
  runTamperSimulation,
} = require('../controllers/adversarialController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ROLES } = require('../config/constants');

router.use(authenticateToken);

router.post('/concurrency', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), runConcurrencyAttack);
router.post('/idempotency', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), runIdempotencyAttack);
router.post('/overdraft', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), runOverdraftAttack);
router.post('/unauthorized-transfer', runUnauthorizedTransferAttack);
router.post('/tamper-check', runTamperVerification);
router.post('/tamper-simulate', runTamperSimulation);

module.exports = router;
