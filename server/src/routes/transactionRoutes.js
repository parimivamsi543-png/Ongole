const express = require('express');
const router = express.Router();
const {
  deposit,
  withdraw,
  transfer,
  getTransactionById,
  getAllTransactions,
} = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { handleIdempotency } = require('../middleware/idempotency');
const { ROLES } = require('../config/constants');

router.use(authenticateToken);

router.get('/', getAllTransactions);
router.get('/:transactionId', getTransactionById);

router.post('/deposit', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), handleIdempotency, deposit);
router.post('/withdraw', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), handleIdempotency, withdraw);
router.post('/transfer', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), handleIdempotency, transfer);

module.exports = router;
