// Creates the single shared Supabase client used by every DB helper.
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Fail fast with a readable message instead of a cryptic error on first query.
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing Supabase configuration. Copy .env.example to .env and fill in ' +
      'SUPABASE_URL and SUPABASE_SERVICE_KEY.'
  );
  process.exit(1);
}

// The bot writes to the database, so the key must be one that bypasses row
// level security. A public key pasted by mistake produces a confusing 42501
// "row-level security policy" error on first use - warn about it at startup.
function warnIfPublicKey(key) {
  // New-style keys: sb_publishable_... is public, sb_secret_... is secret.
  if (key.startsWith('sb_publishable_')) {
    console.error(
      'Warning: SUPABASE_SERVICE_KEY is the public "publishable" key ' +
        '(sb_publishable_...). Use the secret key (sb_secret_...) from ' +
        'Supabase -> Project Settings -> API, or writes will be rejected ' +
        'by row level security.'
    );
    return;
  }

  // Legacy JWT keys embed their role ("anon" = public, "service_role" = secret).
  if (key.startsWith('eyJ')) {
    try {
      const segment = key.split('.')[1] ?? '';
      const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      if (payload.role !== 'service_role') {
        console.error(
          `Warning: SUPABASE_SERVICE_KEY is a JWT with role "${payload.role}" ` +
            ' - that is the public/anon key, not the service_role secret. ' +
            'Copy the service_role key from Supabase -> Project Settings -> ' +
            'API, or writes will be rejected by row level security.'
        );
      }
    } catch (_) {
      /* Unrecognised key format - let Supabase itself validate it. */
    }
  }
}

warnIfPublicKey(SUPABASE_SERVICE_KEY);

module.exports = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    // A server-side bot has no browser session to persist.
    persistSession: false,
    autoRefreshToken: false,
  },
});
