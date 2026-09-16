'use strict';

const express = require('express');
const { ACCOUNTS } = require('@expense/db');
const { verifyTelegramAuth } = require('../middleware/verifyTelegramAuth');

const router = express.Router();

router.use(verifyTelegramAuth);

// GET /api/accounts — fixed payment channels for Add Expense
router.get('/', (req, res) => {
  res.json({ items: ACCOUNTS, currency: 'ETB' });
});

module.exports = router;
