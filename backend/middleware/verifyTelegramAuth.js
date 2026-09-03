// Express middleware: verifies Telegram Mini App `initData` (Mini App step 1).
//
// WHY THIS EXISTS
// The Mini App frontend will send `window.Telegram.WebApp.initData` - a URL-
// encoded query string Telegram injects into the webview. It contains the
// user, an auth_date timestamp, and an HMAC `hash`. Since the request comes
// from the client, anyone could also hand-craft `user={"id":123456789}` - so
// the user data is worthless until we prove Telegram itself signed it. That
// proof is the `hash` field: only Telegram and whoever knows the bot token
// can produce it, and no signed field can be altered without invalidating it.
//
// THE OFFICIAL ALGORITHM
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
//   data_check_string = every initData field EXCEPT `hash` and `signature`,
//                       sorted alphabetically by key, as "key=value" pairs
//                       (values URL-decoded), joined with "\n"
//   secret_key        = HMAC_SHA256(key = <bot token>, message = "WebAppData")
//   expected_hash     = hex( HMAC_SHA256(key = secret_key, message = data_check_string) )
//   valid  <=>  expected_hash === received hash
//
// Two details that trip people up:
// - The secret key is NOT sha256(botToken). That derivation belonged to the
//   old Login Widget. Mini Apps HMAC the literal string "WebAppData" using
//   the bot token as key - a "domain separation" step, so a signature valid
//   in one protocol can never be replayed in another.
// - `signature` is a newer Ed25519 field Telegram adds for third-party
//   validation (verifying without the bot token). It is NOT covered by the
//   bot-token HMAC, so it must be excluded from the check string here;
//   including it would make every computed hash mismatch.
//
// REPLAY PROTECTION
// HMAC proves authenticity, not freshness. auth_date is a unix timestamp
// INSIDE the signed data (so it cannot be tampered with either) and acts as
// the freshness proof: we reject anything older than 24 hours. Telegram
// re-issues initData every time the Mini App opens, so honest clients always
// send a current value.
'use strict';

const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 60 * 60; // replay window
const FUTURE_TOLERANCE_SECONDS = 300; // tolerate small clock skew only

/**
 * Builds the canonical string the HMAC is computed over.
 * URLSearchParams has already URL-decoded every value; `hash` is excluded
 * because a value cannot cover itself, and `signature` because it belongs to
 * the separate Ed25519 scheme (see comment above).
 */
function buildDataCheckString(params) {
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash' || key === 'signature') continue;
    pairs.push([key, value]);
  }
  // Alphabetical by key - Telegram's exact requirement.
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([key, value]) => `${key}=${value}`).join('\n');
}

/**
 * Verifies an initData string against the bot token.
 * @param {string} initData raw initData (the X-Telegram-Init-Data header)
 * @param {string} botToken the bot's token from BotFather
 * @returns {URLSearchParams|null} parsed params when valid, otherwise null
 */
function verifyInitData(initData, botToken) {
  if (typeof initData !== 'string' || initData.length === 0) return null;

  const params = new URLSearchParams(initData); // also URL-decodes every value
  const hash = params.get('hash');

  // The hash is always 64 hex characters (32 bytes). Checking the format
  // first also guarantees the later timingSafeEqual gets equal-length
  // buffers (it throws on unequal lengths).
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  const dataCheckString = buildDataCheckString(params);

  // Step 1 - derive the per-bot secret key.
  const secretKey = crypto
    .createHmac('sha256', botToken)
    .update('WebAppData')
    .digest();

  // Step 2 - recompute the hash over the canonical check string.
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Step 3 - constant-time comparison. A plain `===` on strings leaks how
  // many leading characters match via timing differences; for a 256-bit hash
  // that is not realistically exploitable, but the safe compare is free, so
  // make it a habit on anything cryptographic.
  const expected = Buffer.from(computed, 'hex');
  const received = Buffer.from(hash.toLowerCase(), 'hex');
  const valid =
    expected.length === received.length && crypto.timingSafeEqual(expected, received);

  return valid ? params : null;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

function verifyTelegramAuth(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data');
  if (!initData) {
    return res.status(401).json({ error: 'Missing X-Telegram-Init-Data header.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    // Server misconfiguration is OUR fault, not the caller's: 500, not 401.
    console.error('[auth] TELEGRAM_BOT_TOKEN is not set');
    return res.status(500).json({ error: 'Server is not configured for Telegram auth.' });
  }

  const params = verifyInitData(initData, botToken);
  if (!params) {
    return res.status(401).json({ error: 'Invalid initData signature.' });
  }

  // Replay protection, enforced on the SIGNED auth_date (not on a separate
  // header that could be tampered with independently).
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

  // The user is a JSON blob inside initData, already URL-decoded above.
  let user;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    user = null;
  }
  if (!user || !Number.isInteger(user.id)) {
    return res.status(401).json({ error: 'initData contains no valid user.' });
  }

  // Copy across only the known fields - never forward an unchecked payload.
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