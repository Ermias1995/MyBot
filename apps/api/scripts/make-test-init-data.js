'use strict';

// Dev helper: prints a valid initData string signed with your bot token.
// Usage (from repo root): npm run test:init-data -- [ageOffset] [userId] [firstName]

const { loadEnv } = require('@expense/db');
loadEnv();

const crypto = require('crypto');
const { buildDataCheckString } = require('../src/middleware/verifyTelegramAuth');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env first.');
  process.exit(1);
}

const [ageOffset = 0, userId = 123456789, firstName = 'Test'] = process.argv.slice(2);

const params = new URLSearchParams();
params.set('auth_date', String(Math.floor(Date.now() / 1000) - Number(ageOffset)));
params.set('query_id', 'AAF-test-query-id');
params.set(
  'user',
  JSON.stringify({
    id: Number(userId),
    first_name: String(firstName),
    username: 'test_user',
    language_code: 'en',
  })
);

const secretKey = crypto.createHmac('sha256', botToken).update('WebAppData').digest();
const hash = crypto
  .createHmac('sha256', secretKey)
  .update(buildDataCheckString(params))
  .digest('hex');
params.set('hash', hash);

console.log(params.toString());
