'use strict';

// Verifies Telegram Mini App initData (HMAC + replay window).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 60 * 60;
const FUTURE_TOLERANCE_SECONDS = 300;

function buildDataCheckString(params) {
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash' || key === 'signature') continue;
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([key, value]) => `${key}=${value}`).join('\n');
}

function verifyInitData(initData, botToken) {
  if (typeof initData !== 'string' || initData.length === 0) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  const dataCheckString = buildDataCheckString(params);
  const secretKey = crypto.createHmac('sha256', botToken).update('WebAppData').digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expected = Buffer.from(computed, 'hex');
  const received = Buffer.from(hash.toLowerCase(), 'hex');
  const valid =
    expected.length === received.length && crypto.timingSafeEqual(expected, received);

  return valid ? params : null;
}

function verifyTelegramAuth(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data');
  if (!initData) {
    return res.status(401).json({ error: 'Missing X-Telegram-Init-Data header.' });
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!botToken) {
    console.error('[auth] TELEGRAM_BOT_TOKEN is not set');
    return res.status(500).json({ error: 'Server is not configured for Telegram auth.' });
  }

  const params = verifyInitData(initData, botToken);
  if (!params) {
    return res.status(401).json({
      error:
        'Invalid initData signature. TELEGRAM_BOT_TOKEN in .env must be the API token for the same bot that opens this Mini App.',
    });
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return res.status(401).json({ error: 'initData is missing auth_date.' });
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > MAX_AGE_SECONDS) {
    return res.status(401).json({ error: 'initData expired (older than 24 hours).' });
  }
  if (ageSeconds < -FUTURE_TOLERANCE_SECONDS) {
    return res.status(401).json({ error: 'initData auth_date is in the future.' });
  }

  let user;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    user = null;
  }
  if (!user || !Number.isInteger(user.id)) {
    return res.status(401).json({ error: 'initData contains no valid user.' });
  }

  req.telegramUser = {
    id: user.id,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    username: user.username ?? null,
    language_code: user.language_code ?? null,
    photo_url: user.photo_url ?? null,
  };

  next();
}

module.exports = { verifyTelegramAuth, verifyInitData, buildDataCheckString };
