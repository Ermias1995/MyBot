'use strict';

const path = require('path');
const fs = require('fs');

// Monorepo root .env (packages/db/src → ../../../.env)
const ROOT_ENV = path.resolve(__dirname, '../../../.env');

function loadEnv() {
  if (fs.existsSync(ROOT_ENV)) {
    require('dotenv').config({ path: ROOT_ENV });
  } else {
    require('dotenv').config();
  }
}

module.exports = { loadEnv, ROOT_ENV };
