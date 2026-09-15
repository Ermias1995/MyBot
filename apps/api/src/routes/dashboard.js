'use strict';

const express = require('express');
const { getDashboard } = require('@expense/db');
const { verifyTelegramAuth } = require('../middleware/verifyTelegramAuth');

const router = express.Router();

router.get('/', verifyTelegramAuth, async (req, res) => {
  try {
    const payload = await getDashboard(req.telegramUser);
    res.json(payload);
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

module.exports = router;
