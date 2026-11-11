const express = require('express');
const router = express.Router();
const { generateAccountStatement } = require('../controllers/statementController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/:accountId', generateAccountStatement);

module.exports = router;
