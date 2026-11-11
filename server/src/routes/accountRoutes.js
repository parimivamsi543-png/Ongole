const express = require('express');
const router = express.Router();
const {
  getMyAccounts,
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccountStatus,
  getTransferDirectory,
  getAllUsers,
  updateOverdraftLimit,
} = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole, requireAccountOwnership } = require('../middleware/rbac');
const { ROLES } = require('../config/constants');

router.use(authenticateToken);

router.get('/my', getMyAccounts);
router.get('/directory', getTransferDirectory);
router.get('/users', requireRole(ROLES.ADMIN), getAllUsers);
router.get('/', requireRole(ROLES.ADMIN, ROLES.AUDITOR), getAllAccounts);
router.get('/:id', requireAccountOwnership('id'), getAccountById);
router.post('/', requireRole(ROLES.ADMIN, ROLES.ACCOUNT_HOLDER), createAccount);
router.patch('/:id/status', requireRole(ROLES.ADMIN), updateAccountStatus);
router.patch('/:id/overdraft', requireRole(ROLES.ADMIN), updateOverdraftLimit);

module.exports = router;
