'use strict';

// Vercel serverless entry — re-exports the Express app.
// Routes stay under /api/* (same paths as local).
module.exports = require('../apps/api/src/server');
