// Dev-only helper: prints a VALID initData string signed with your bot token,
// exactly the way Telegram signs real ones, so the backend can be tested
// without opening a Mini App. Same HMAC scheme the middleware verifies:
// secret = HMAC(botToken, "WebAppData"); hash = HMAC(secret, checkString).
//
// Usage (from the backend folder):
//   node scripts/make-test-init-data.js             # fresh, user id 123456789, "Test"
//   node scripts/make-test-init-data.js 90000       # auth_date 25h in the past -> replay rejection
//   node scripts/make-test-init-data.js -5000       # auth_date in the future -> clock-skew rejection
//   node scripts/make-test-init-data.js 0 42 Alice  # fresh, custom user id and first name
//
// Reads TELEGRAM_BOT_TOKEN from backend/.env.
'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { buildDataCheckString } = require('../middleware/verifyTelegramAuth');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env first.');
  process.exit(1);
}

const [ageOffset = 0, userId = 123456789, firstName = 'Test'] = process.argv.slice(2);

// Build the initData fields; URLSearchParams encodes them exactly like the
// real client does (e.g. the user JSON becomes user=%7B%22id%22...).
const params = new URLSearchParams();
params.set('auth_date', String(Math.floor(Date.now() / 1000) - Number(ageOffset)));
params.set('query_id', 'AAF-test-query-id'); // arbitrary; the verifier ignores it
params.set(
  'user',
  JSON.stringify({
    id: Number(userId),
    first_name: String(firstName),
    username: 'test_user',
    language_code: 'en',
  })
);

// Canonical check string, identical to what the middleware will rebuild.
const dataCheckString = buildDataCheckString(params);

// The same two-step key derivation Telegram performs.
const secretKey = crypto
  .createHmac('sha256', botToken)
  .update('WebAppData')
  .digest();
const hash = crypto
  .createHmac('sha256', secretKey)
  .update(dataCheckString)
  .digest('hex');

params.set('hash', hash);
console.log(params.toString());
