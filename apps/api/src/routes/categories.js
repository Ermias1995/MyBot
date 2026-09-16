'use strict';

const express = require('express');
const { ensureUser } = require('@expense/db');
const { verifyTelegramAuth } = require('../middleware/verifyTelegramAuth');
const { asyncHandler, sendError } = require('../lib/http');

const router = express.Router();

router.use(verifyTelegramAuth);

// GET /api/categories — needed by Add Expense / filters
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const items = await ensureUser(req.telegramUser);
      res.json({ items });
    } catch (err) {
      sendError(res, err, 'Could not list categories.');
    }
  })
);

module.exports = router;
