'use strict';

// Keyword → category. Order matters: first hit wins.
// Names must match DEFAULT_CATEGORIES in @expense/db.
const KEYWORDS = [
  { match: ['rent', 'landlord'], category: 'Rent' },
  { match: ['groceries', 'supermarket', 'grocery', 'milk', 'bread', 'eggs'], category: 'Groceries' },
  { match: ['lunch', 'dinner', 'breakfast', 'coffee', 'food', 'snack', 'restaurant', 'pizza', 'burger'], category: 'Food' },
  { match: ['uber', 'taxi', 'bus', 'train', 'fuel', 'petrol', 'gas', 'metro'], category: 'Transport' },
  { match: ['movie', 'cinema', 'netflix', 'game', 'concert', 'party'], category: 'Entertainment' },
  { match: ['pharmacy', 'doctor', 'meds', 'medicine', 'hospital', 'dentist'], category: 'Health' },
  { match: ['electricity', 'water', 'internet', 'phone', 'bill', 'subscription'], category: 'Bills' },
];

/**
 * @param {string} text
 * @returns {{ ok: true, amount: number, note: string } | { ok: false, error: string }}
 */
function parseExpense(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Send me a text message like: 150 lunch' };
  }

  const trimmed = text.trim();
  const match = trimmed.match(/^([0-9][0-9.,]*)\s+(.+)$/);

  if (!match) {
    if (/^[0-9]+(?:[.,][0-9]+)?$/.test(trimmed)) {
      return { ok: false, error: 'You gave me an amount but no note. Try: 150 lunch' };
    }
    return {
      ok: false,
      error: 'I could not parse that. Start with the amount, then the note. Try: 150 lunch',
    };
  }

  const amount = Number(match[1].replace(/,/g, ''));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'The amount must be a positive number. Try: 150 lunch' };
  }
  if (amount > 100000000) {
    return { ok: false, error: 'That amount is too large to be plausible.' };
  }

  const note = match[2].replace(/\s+/g, ' ').trim().slice(0, 200);
  return { ok: true, amount, note };
}

/**
 * @param {string} note
 * @param {{ id: number, name: string }[]} categories
 * @returns {{ id: number, name: string } | null}
 */
function guessCategory(note, categories) {
  if (!note || !Array.isArray(categories) || categories.length === 0) return null;

  const lower = ` ${note.toLowerCase()} `;
  for (const { match, category } of KEYWORDS) {
    if (match.some((word) => lower.includes(` ${word} `))) {
      return categories.find((c) => c.name === category) ?? null;
    }
  }

  const bare = note.trim().toLowerCase();
  return (
    categories.find((c) => {
      const name = c.name.toLowerCase();
      return name === bare || name.startsWith(`${bare} `);
    }) ?? null
  );
}

module.exports = { parseExpense, guessCategory };
