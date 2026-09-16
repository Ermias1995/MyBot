'use strict';

const express = require('express');
const {
  ensureUser,
  listBudgets,
  getBudget,
  upsertBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
} = require('@expense/db');
const { verifyTelegramAuth } = require('../middleware/verifyTelegramAuth');
const {
  asyncHandler,
  sendError,
  parsePositiveAmount,
  parseOptionalCategoryId,
  parseIdParam,
} = require('../lib/http');

const router = express.Router();

router.use(verifyTelegramAuth);

function migrationHint(err) {
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /budgets/i.test(err?.message || '')) {
    return 'Budgets table missing. Run supabase/migrations/001_budgets.sql in the Supabase SQL editor.';
  }
  return null;
}

// GET /api/budgets/summary?month=YYYY-MM  (must be before /:id)
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const summary = await getBudgetSummary(req.telegramUser.id, req.query.month);
      res.json(summary);
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not load budget summary.');
    }
  })
);

// GET /api/budgets?month=YYYY-MM
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const items = await listBudgets(req.telegramUser.id, { month: req.query.month });
      res.json({ items });
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not list budgets.');
    }
  })
);

// POST /api/budgets  { amount, month?, categoryId? }
// Upserts overall (categoryId omitted/null) or per-category budget for the month.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const body = req.body || {};
      const amount = parsePositiveAmount(body.amount);
      const categoryId = Object.prototype.hasOwnProperty.call(body, 'categoryId')
        ? parseOptionalCategoryId(body.categoryId)
        : null;
      const month = body.month || undefined;

      const budget = await upsertBudget({
        telegramId: req.telegramUser.id,
        amount,
        month,
        categoryId,
      });
      res.status(201).json(budget);
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not save budget.');
    }
  })
);

// GET /api/budgets/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const budget = await getBudget(req.telegramUser.id, id);
      if (!budget) return res.status(404).json({ error: 'Budget not found.' });
      res.json(budget);
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not load budget.');
    }
  })
);

// PATCH /api/budgets/:id  { amount }
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const amount = parsePositiveAmount((req.body || {}).amount);
      const updated = await updateBudget(req.telegramUser.id, id, { amount });
      if (!updated) return res.status(404).json({ error: 'Budget not found.' });
      res.json(updated);
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not update budget.');
    }
  })
);

// DELETE /api/budgets/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const removed = await deleteBudget(req.telegramUser.id, id);
      if (!removed) return res.status(404).json({ error: 'Budget not found.' });
      res.json({ ok: true, deleted: removed });
    } catch (err) {
      const hint = migrationHint(err);
      if (hint) return res.status(503).json({ error: hint });
      sendError(res, err, 'Could not delete budget.');
    }
  })
);

module.exports = router;
