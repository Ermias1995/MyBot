'use strict';

const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./loadEnv');

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing Supabase configuration. Copy .env.example to .env at the repo root ' +
      'and fill in SUPABASE_URL and SUPABASE_SERVICE_KEY.'
  );
  process.exit(1);
}

function warnIfPublicKey(key) {
  if (key.startsWith('sb_publishable_')) {
    console.error(
      'Warning: SUPABASE_SERVICE_KEY looks like a public publishable key. ' +
        'Use the service_role / secret key or RLS will block writes.'
    );
    return;
  }

  if (key.startsWith('eyJ')) {
    try {
      const segment = key.split('.')[1] ?? '';
      const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      if (payload.role !== 'service_role') {
        console.error(
          `Warning: SUPABASE_SERVICE_KEY JWT role is "${payload.role}", not service_role.`
        );
      }
    } catch (_) {
      /* let Supabase validate unrecognized formats */
    }
  }
}

warnIfPublicKey(SUPABASE_SERVICE_KEY);

module.exports = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
