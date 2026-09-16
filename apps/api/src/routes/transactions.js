'use strict';

const express = require('express');
const {
  ensureUser,
  listTransactions,
  getTransaction,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} = require('@expense/db');
const { verifyTelegramAuth } = require('../middleware/verifyTelegramAuth');
const {
  asyncHandler,
  sendError,
  parsePositiveAmount,
  parseOptionalCategoryId,
  parseOptionalDate,
  parseIdParam,
  parseNote,
  parseAccount,
} = require('../lib/http');

const router = express.Router();

router.use(verifyTelegramAuth);

// GET /api/transactions?from=&to=&categoryId=&account=&q=&limit=&offset=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const result = await listTransactions(req.telegramUser.id, {
        from: req.query.from || undefined,
        to: req.query.to || undefined,
        categoryId:
          req.query.categoryId != null && req.query.categoryId !== ''
            ? parseOptionalCategoryId(req.query.categoryId)
            : undefined,
        account: req.query.account || undefined,
        q: req.query.q || undefined,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err, 'Could not list transactions.');
    }
  })
);

// POST /api/transactions  { amount, note?, categoryId?, spentAt?, account? }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const body = req.body || {};
      const amount = parsePositiveAmount(body.amount);
      const note = parseNote(body.note);
      const categoryId = parseOptionalCategoryId(body.categoryId);
      const spentAt = parseOptionalDate(body.spentAt, 'spentAt');
      const account = parseAccount(body.account);

      if (categoryId == null) {
        return res.status(400).json({ error: 'categoryId is required.' });
      }

      const created = await addTransaction({
        telegramId: req.telegramUser.id,
        amount,
        note,
        categoryId,
        spentAt: spentAt || undefined,
        account,
      });
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err, 'Could not create transaction.');
    }
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const tx = await getTransaction(req.telegramUser.id, id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
      res.json(tx);
    } catch (err) {
      sendError(res, err, 'Could not load transaction.');
    }
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const body = req.body || {};
      const patch = {};

      if (body.amount != null) patch.amount = parsePositiveAmount(body.amount);
      if (body.note != null) patch.note = parseNote(body.note);
      if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
        patch.categoryId = parseOptionalCategoryId(body.categoryId);
      }
      if (body.spentAt != null) patch.spentAt = parseOptionalDate(body.spentAt, 'spentAt');
      if (Object.prototype.hasOwnProperty.call(body, 'account')) {
        patch.account = parseAccount(body.account);
      }

      const updated = await updateTransaction(req.telegramUser.id, id, patch);
      if (!updated) return res.status(404).json({ error: 'Transaction not found.' });
      res.json(updated);
    } catch (err) {
      sendError(res, err, 'Could not update transaction.');
    }
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      await ensureUser(req.telegramUser);
      const id = parseIdParam(req.params.id);
      const removed = await deleteTransaction(req.telegramUser.id, id);
      if (!removed) return res.status(404).json({ error: 'Transaction not found.' });
      res.json({ ok: true, deleted: removed });
    } catch (err) {
      sendError(res, err, 'Could not delete transaction.');
    }
  })
);

module.exports = router;
