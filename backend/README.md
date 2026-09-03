# Mini App Backend (Step 1: Authentication)

Express API that the future Telegram Mini App (React) will call. Right now it
contains exactly one protected route, `GET /api/me`, plus the middleware that
verifies Telegram `initData`. No database, no business endpoints yet - that is
intentional for this step.

## Setup

```powershell
cd backend
npm install
Copy-Item .env.example .env    # then set TELEGRAM_BOT_TOKEN (same token as the bot) and PORT
npm start                      # -> Backend listening on http://localhost:3000
```

## How the auth works (30 seconds)

When your Mini App opens inside Telegram, Telegram injects
`window.Telegram.WebApp.initData` - a query string containing the user, an
`auth_date`, and an HMAC-SHA256 `hash` computed with a key derived from *your*
bot token. `backend/middleware/verifyTelegramAuth.js` rebuilds that hash
server-side and compares it. A match proves the data came from Telegram and
was not altered, because only Telegram and the bot token can produce it.
Requests whose `auth_date` is older than 24 hours are rejected (replay
protection). This step touches no database.

## Test A: valid fake initData (no Telegram needed)

`scripts/make-test-init-data.js` signs test data exactly the way Telegram
would, using the same HMAC scheme and your bot token:

```powershell
cd backend
node scripts/make-test-init-data.js            # fresh initData, user id 123456789
node scripts/make-test-init-data.js 90000      # auth_date 25h in the past -> tests replay rejection
node scripts/make-test-init-data.js -5000      # auth_date in the future -> tests clock-skew rejection
```

Call the API with the printed string (PowerShell - use `curl.exe`, not the
`curl` alias, or use `Invoke-RestMethod`):

```powershell
$init = (node scripts/make-test-init-data.js | Out-String).Trim()
Invoke-RestMethod -Uri http://localhost:3000/api/me -Headers @{ 'X-Telegram-Init-Data' = $init }
curl.exe -H "X-Telegram-Init-Data: $init" http://localhost:3000/api/me
```

Expected: `{"telegramUser":{"id":123456789,"first_name":"Test",...}}`

Negative tests, each must give a 401 with the stated message:

| Request | Message |
|---------|---------|
| No header | `Missing X-Telegram-Init-Data header.` |
| Change one character of the header value | `Invalid initData signature.` |
| `node scripts/make-test-init-data.js 90000` | `initData expired (older than 24 hours).` |
| `node scripts/make-test-init-data.js -5000` | `initData auth_date is in the future.` |

## Test B: real initData from Telegram (end-to-end proof)

1. Telegram loads Mini Apps over https, so expose the debug page publicly:
   `npx ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`
   - note the https URL. (The API itself can stay on localhost.)
2. Save this as `debug.html` on any static host (or serve it through the
   tunnel):

```html
<!doctype html>
<html><body><pre id="out">loading...</pre>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>
  document.getElementById('out').textContent =
    Telegram.WebApp.initData || 'NO INIT DATA - open this page from Telegram';
</script></body></html>
```

3. In BotFather: `/newapp` -> pick your bot -> set the Web App URL to the
   https URL of `debug.html`. Open your bot's chat and launch the app (menu
   button). The page prints the real `initData` string - copy it.
4. `curl.exe -H "X-Telegram-Init-Data: <paste>" http://localhost:3000/api/me`
   -> the user Telegram actually authenticated.

## Notes

- `initData` is only trustworthy *after* the HMAC check; the backend never
  reads the user identity from a request body.
- The 24h window is safe because Telegram re-issues initData every time the
  Mini App opens - clients simply always send the current value.
- CORS: localhost (any port) plus `FRONTEND_ORIGIN` once you know the Mini
  App's final domain; everything else is refused.
- Wiring `req.telegramUser.id` to `users.telegram_id` (the bot's table) comes
  in a later step - deliberately out of scope here.