'use strict';

const db = require('@expense/db');
db.loadEnv();

const express = require('express');
const cors = require('cors');
const { verifyTelegramAuth } = require('./middleware/verifyTelegramAuth');
const dashboardRoute = require('./routes/dashboard');
const transactionsRoute = require('./routes/transactions');
const categoriesRoute = require('./routes/categories');
const budgetsRoute = require('./routes/budgets');

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN. Set it in .env (local) or Vercel env vars.');
  // Don't process.exit on Vercel cold start — throw so the request fails clearly.
  if (require.main === module) {
    process.exit(1);
  }
}

const app = express();

const LOCAL_DEV = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LOCAL_DEV.test(origin) || origin === FRONTEND_ORIGIN) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  })
);

app.use(express.json());

app.get('/api/me', verifyTelegramAuth, (req, res) => {
  res.json({ telegramUser: req.telegramUser });
});

app.use('/api/dashboard', dashboardRoute);
app.use('/api/transactions', transactionsRoute);
app.use('/api/categories', categoriesRoute);
app.use('/api/budgets', budgetsRoute);
app.use('/api/accounts', require('./routes/accounts'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Local: listen. Vercel: export the app as a serverless function.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    if (!FRONTEND_ORIGIN) {
      console.log('FRONTEND_ORIGIN is not set — CORS allows localhost only.');
    }
  });
}

module.exports = app;
