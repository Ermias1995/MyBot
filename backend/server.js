// Mini App backend - step 1 only: Telegram initData authentication.
// Deliberately no database calls and no business endpoints yet; the only
// protected route is GET /api/me, which exists to prove the auth flow works.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { verifyTelegramAuth } = require('./middleware/verifyTelegramAuth');

const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN; // future React Mini App origin
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();

// The Mini App will be served from a different origin than this API, so the
// browser needs explicit permission via CORS. We allow:
//   - localhost on any port (developing the React app locally)
//   - exactly one production domain, via FRONTEND_ORIGIN in .env
// Requests without an Origin header (curl, server-to-server calls) are not
// governed by CORS at all, so they pass through untouched.
const LOCAL_DEV = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LOCAL_DEV.test(origin) || origin === FRONTEND_ORIGIN) {
        callback(null, true);
      } else {
        // Sends no Access-Control-Allow-Origin header -> the browser blocks it.
        callback(null, false);
      }
    },
  })
);

// JSON request bodies for the endpoints that will be added in later steps.
app.use(express.json());

// The one route in this step. The Mini App sends its initData in the
// X-Telegram-Init-Data header; on success req.telegramUser is populated.
app.get('/api/me', verifyTelegramAuth, (req, res) => {
  res.json({ telegramUser: req.telegramUser });
});

// Unknown paths get a JSON 404 instead of Express's HTML default page.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Keep errors machine-readable too (e.g. malformed JSON bodies -> 500 JSON).
app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  if (!FRONTEND_ORIGIN) {
    console.log('FRONTEND_ORIGIN is not set - CORS allows localhost origins only.');
  }
});
