// Entry point: wires Telegram commands and messages to the parser + DB layer.
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const queries = require('./db/queries');
const { parseExpense, guessCategory } = require('./parsers/manualParser');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('Expense bot is running (long polling). Press Ctrl+C to stop.');

// Never fail silently: polling problems (network, bad token) get logged here.
bot.on('polling_error', (err) => console.error('[polling_error]', err.message));

// ---------------------------------------------------------------------------
// Inline keyboards
// ---------------------------------------------------------------------------

// Category picker, two buttons per row. callback_data carries the transaction
// id and the category id, so a button press alone is enough to update the DB.
function categoryButtons(categories, transactionId) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(
      categories.slice(i, i + 2).map((c) => ({
        text: c.name,
        callback_data: `setcat:${transactionId}:${c.id}`,
      }))
    );
  }
  return { inline_keyboard: rows };
}

const DB_DOWN = '😕 Could not reach the database. Please try again in a moment.';

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

bot.onText(/^\/start/, async (msg) => {
  try {
    const categories = await queries.ensureUser(msg.from);
    bot.sendMessage(
      msg.chat.id,
      [
        `Hi ${msg.from.first_name || 'there'}! Send me an amount and what it was for:`,
        '',
        '  150 lunch',
        '  2400 rent for september',
        '',
        'Commands:',
        '/summary - this month by category',
        '/undo - delete your last expense',
        '/categories - list your categories',
        '',
        `You have ${categories.length} categories ready.`,
      ].join('\n')
    );
  } catch (err) {
    console.error('[/start]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/summary/, async (msg) => {
  try {
    const { total, byCategory } = await queries.getMonthlySummary(msg.from.id);
    if (byCategory.length === 0) {
      bot.sendMessage(msg.chat.id, 'No expenses logged this month yet. Try: 150 lunch');
      return;
    }
    const lines = byCategory.map((r) => `${r.category}: ${r.total.toFixed(2)}`);
    bot.sendMessage(
      msg.chat.id,
      [`📊 This month: ${total.toFixed(2)} total`, '', ...lines].join('\n')
    );
  } catch (err) {
    console.error('[/summary]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/undo/, async (msg) => {
  try {
    const removed = await queries.deleteLastTransaction(msg.from.id);
    if (!removed) {
      bot.sendMessage(msg.chat.id, 'Nothing to undo - you have no expenses logged.');
      return;
    }
    bot.sendMessage(
      msg.chat.id,
      `🗑 Deleted: ${Number(removed.amount).toFixed(2)} ${removed.note || '(no note)'}`
    );
  } catch (err) {
    console.error('[/undo]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/categories/, async (msg) => {
  try {
    const categories = await queries.listCategories(msg.from.id);
    if (categories.length === 0) {
      bot.sendMessage(msg.chat.id, 'No categories yet. Send /start to create the defaults.');
      return;
    }
    const lines = categories.map((c) => `- ${c.name}`);
    bot.sendMessage(msg.chat.id, ['Your categories:', '', ...lines].join('\n'));
  } catch (err) {
    console.error('[/categories]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

// ---------------------------------------------------------------------------
// Free-text expense logging
// ---------------------------------------------------------------------------

bot.on('message', async (msg) => {
  // Commands are handled by onText above; stickers/photos have no msg.text.
  if (!msg.from || !msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const parsed = parseExpense(msg.text);
  if (!parsed.ok) {
    bot.sendMessage(chatId, `🤖 ${parsed.error}`);
    return;
  }

  try {
    // Idempotent: registers + seeds defaults on first use, no-op afterwards.
    const categories = await queries.ensureUser(msg.from);
    const match = guessCategory(parsed.note, categories);

    const tx = await queries.addTransaction({
      telegramId: msg.from.id,
      categoryId: match ? match.id : null,
      amount: parsed.amount,
      note: parsed.note,
    });

    if (match) {
      bot.sendMessage(
        chatId,
        `✅ Logged ${parsed.amount.toFixed(2)} - ${match.name} (${parsed.note})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Change category', callback_data: `chg:${tx.id}` }],
            ],
          },
        }
      );
    } else {
      // Saved right away with no category; the user taps one to fill it in.
      bot.sendMessage(
        chatId,
        `🤔 Logged ${parsed.amount.toFixed(2)} - ${parsed.note}\nWhich category is this?`,
        { reply_markup: categoryButtons(categories, tx.id) }
      );
    }
  } catch (err) {
    console.error('[message]', err);
    bot.sendMessage(chatId, DB_DOWN);
  }
});

// ---------------------------------------------------------------------------
// Inline button presses
// ---------------------------------------------------------------------------

bot.on('callback_query', async (query) => {
  const [action, txId, categoryId] = String(query.data).split(':');

  try {
    // "Change category" on an already-logged expense. Placeholder for now -
    // it will be wired up to actually update the DB in a later step.
    if (action === 'chg') {
      await bot.answerCallbackQuery(query.id, {
        text: 'For now: send /undo, then log the expense again.',
        show_alert: true,
      });
      return;
    }

    if (action === 'setcat') {
      const txIdNum = Number(txId);
      const catIdNum = Number(categoryId);
      if (!Number.isInteger(txIdNum) || !Number.isInteger(catIdNum)) {
        await bot.answerCallbackQuery(query.id, { text: 'Malformed button data.' });
        return;
      }

      const updated = await queries.updateTransactionCategory(
        query.from.id,
        txIdNum,
        catIdNum
      );
      if (!updated) {
        await bot.answerCallbackQuery(query.id, { text: 'That transaction no longer exists.' });
        return;
      }
      await bot.answerCallbackQuery(query.id, { text: 'Category saved ✅' });
      // Swap the keyboard for a dead button so a second tap cannot re-save.
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '✅ Category saved', callback_data: 'noop' }]] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
      return;
    }

    if (action === 'noop') {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    await bot.answerCallbackQuery(query.id, { text: 'Unknown action.' });
  } catch (err) {
    console.error('[callback]', err);
    try {
      await bot.answerCallbackQuery(query.id, { text: 'Something went wrong. Try again.' });
    } catch (_) {
      /* callback queries expire; nothing else to do */
    }
  }
});

// Stop long polling cleanly on Ctrl+C so the process exits promptly.
process.on('SIGINT', () => {
  console.log('\nStopping bot...');
  bot.stopPolling().finally(() => process.exit(0));
});

// Last-resort safety net so a stray async error cannot kill the process.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));