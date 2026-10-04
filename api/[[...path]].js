'use strict';

// Catch-all serverless entry so /api/dashboard, /api/transactions, etc. hit Express.
module.exports = require('../apps/api/src/server');
