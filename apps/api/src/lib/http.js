'use strict';

/**
 * Shared request helpers for Mini App API routes.
 */

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sendError(res, err, fallback = 'Request failed.') {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.status ? err.message : fallback });
}

function parsePositiveAmount(value) {
  const amount = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number.');
    err.status = 400;
    throw err;
  }
  if (amount > 100000000) {
    const err = new Error('amount is too large.');
    err.status = 400;
    throw err;
  }
  return Math.round(amount * 100) / 100;
}

function parseOptionalCategoryId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('categoryId must be a positive integer.');
    err.status = 400;
    throw err;
  }
  return id;
}

function parseOptionalDate(value, fieldName = 'date') {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    const err = new Error(`${fieldName} must be a valid ISO date.`);
    err.status = 400;
    throw err;
  }
  return d.toISOString();
}

function parseIdParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Invalid id.');
    err.status = 400;
    throw err;
  }
  return id;
}

function parseNote(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 200);
}

function parseAccount(value) {
  if (value == null || value === '') return 'Cash';
  const allowed = ['Telebirr', 'CBE', 'Cash'];
  const match = allowed.find((a) => a.toLowerCase() === String(value).toLowerCase());
  if (!match) {
    const err = new Error('account must be Telebirr, CBE, or Cash.');
    err.status = 400;
    throw err;
  }
  return match;
}

module.exports = {
  asyncHandler,
  sendError,
  parsePositiveAmount,
  parseOptionalCategoryId,
  parseOptionalDate,
  parseIdParam,
  parseNote,
  parseAccount,
};
