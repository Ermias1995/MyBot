'use strict';

const queries = require('@expense/db');
queries.loadEnv();

const TelegramBot = require('node-telegram-bot-api');
const { parseExpense, guessCategory } = require('./parsers/manualParser');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env at the repo root.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('Expense bot is running (long polling). Press Ctrl+C to stop.');

bot.on('polling_error', (err) => console.error('[polling_error]', err.message));

// Slash-menu under the "/" button in Telegram
bot
  .setMyCommands([
    { command: 'start', description: 'Welcome + show buttons' },
    { command: 'summary', description: 'This month by category' },
    { command: 'undo', description: 'Delete last expense' },
    { command: 'categories', description: 'List your categories' },
  ])
  .catch((err) => console.error('[setMyCommands]', err.message));

bot
  .setMyDescription(
    'Track daily expenses in chat. Send "150 lunch" to log spending, ' +
      'use the buttons for summary/undo, and open the Dashboard Mini App for charts.'
  )
  .catch((err) => console.error('[setMyDescription]', err.message));

bot
  .setMyShortDescription('Log expenses by chat. Tap buttons for summary, undo, and dashboard.')
  .catch((err) => console.error('[setMyShortDescription]', err.message));

const BTN_SUMMARY = '📊 Summary';
const BTN_UNDO = '🗑 Undo';
const BTN_CATEGORIES = '📁 Categories';
const BTN_DASHBOARD = '📈 Dashboard';

// Permanent reply keyboard under the message box.
// Optional: set MINIAPP_URL in .env (your Cloudflare/Netlify HTTPS URL)
// to add a Dashboard button that opens the Mini App.
function mainKeyboard() {
  const row1 = [{ text: BTN_SUMMARY }, { text: BTN_UNDO }];
  const row2 = [{ text: BTN_CATEGORIES }];
  if (process.env.MINIAPP_URL) {
    row2.push({ text: BTN_DASHBOARD, web_app: { url: process.env.MINIAPP_URL } });
  }
  return {
    keyboard: [row1, row2],
    resize_keyboard: true,
    is_persistent: true,
  };
}

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

async function sendSummary(chatId, telegramId) {
  const { total, byCategory } = await queries.getMonthlySummary(telegramId);
  if (byCategory.length === 0) {
    await bot.sendMessage(chatId, 'No expenses logged this month yet. Try: 150 lunch');
    return;
  }
  const lines = byCategory.map((r) => `${r.category}: ${r.total.toFixed(2)}`);
  await bot.sendMessage(
    chatId,
    [`📊 This month: ${total.toFixed(2)} total`, '', ...lines].join('\n')
  );
}

async function sendUndo(chatId, telegramId) {
  const removed = await queries.deleteLastTransaction(telegramId);
  if (!removed) {
    await bot.sendMessage(chatId, 'Nothing to undo - you have no expenses logged.');
    return;
  }
  await bot.sendMessage(
    chatId,
    `🗑 Deleted: ${Number(removed.amount).toFixed(2)} ${removed.note || '(no note)'}`
  );
}

async function sendCategories(chatId, telegramId) {
  const categories = await queries.listCategories(telegramId);
  if (categories.length === 0) {
    await bot.sendMessage(chatId, 'No categories yet. Send /start to create the defaults.');
    return;
  }
  const lines = categories.map((c) => `- ${c.name}`);
  await bot.sendMessage(chatId, ['Your categories:', '', ...lines].join('\n'));
}

bot.onText(/^\/start/, async (msg) => {
  try {
    const categories = await queries.ensureUser(msg.from);
    const lines = [
      `👋 Hi ${msg.from.first_name || 'there'} — welcome to My Expenses!`,
      '',
      'I help you track spending in Telegram.',
      '',
      '📝 How to log an expense',
      'Send amount + note in one message:',
      '  • 150 lunch',
      '  • 2400 rent for september',
      '  • 80 coffee',
      '',
      'I’ll guess the category (Food, Transport, Rent, …).',
      'If I’m unsure, I’ll show buttons so you can pick one.',
      '',
      '🔘 Buttons below',
      '  📊 Summary — this month by category',
      '  🗑 Undo — delete your last expense',
      '  📁 Categories — see your category list',
    ];
    if (process.env.MINIAPP_URL) {
      lines.push('  📈 Dashboard — open charts in the Mini App');
    } else {
      lines.push('', 'Tip: add MINIAPP_URL to .env to enable the Dashboard button.');
    }
    lines.push(
      '',
      'You can also type /summary, /undo, or /categories.',
      '',
      `✅ Ready — ${categories.length} categories set up. Try: 150 lunch`
    );
    await bot.sendMessage(msg.chat.id, lines.join('\n'), {
      reply_markup: mainKeyboard(),
    });
  } catch (err) {
    console.error('[/start]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/summary/, async (msg) => {
  try {
    await sendSummary(msg.chat.id, msg.from.id);
  } catch (err) {
    console.error('[/summary]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/undo/, async (msg) => {
  try {
    await sendUndo(msg.chat.id, msg.from.id);
  } catch (err) {
    console.error('[/undo]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.onText(/^\/categories/, async (msg) => {
  try {
    await sendCategories(msg.chat.id, msg.from.id);
  } catch (err) {
    console.error('[/categories]', err);
    bot.sendMessage(msg.chat.id, DB_DOWN);
  }
});

bot.on('message', async (msg) => {
  if (!msg.from || !msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Reply-keyboard taps
  try {
    if (text === BTN_SUMMARY) {
      await sendSummary(chatId, msg.from.id);
      return;
    }
    if (text === BTN_UNDO) {
      await sendUndo(chatId, msg.from.id);
      return;
    }
    if (text === BTN_CATEGORIES) {
      await sendCategories(chatId, msg.from.id);
      return;
    }
  } catch (err) {
    console.error('[keyboard]', err);
    bot.sendMessage(chatId, DB_DOWN);
    return;
  }

  const parsed = parseExpense(msg.text);
  if (!parsed.ok) {
    bot.sendMessage(chatId, `🤖 ${parsed.error}`);
    return;
  }

  try {
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

bot.on('callback_query', async (query) => {
  const [action, txId, categoryId] = String(query.data).split(':');

  try {
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
      /* callback expired */
    }
  }
});

process.on('SIGINT', () => {
  console.log('\nStopping bot...');
  bot.stopPolling().finally(() => process.exit(0));
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
