// Text parsing: turns free-form input into structured data.
// Kept free of any I/O so it is trivial to unit-test without Telegram/Supabase.

// Keyword -> category. Order matters: the first hit wins, so put specific
// categories (Rent) before generic ones. Names must match the defaults
// seeded in src/db/queries.js.
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
 * Parses messages like "150 lunch" or "2400 rent for september".
 * @param {string} text raw message text from the user
 * @returns {{ ok: true, amount: number, note: string } | { ok: false, error: string }}
 */
function parseExpense(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Send me a text message like: 150 lunch' };
  }

  const trimmed = text.trim();

  // First token must be a number (dot/comma decimals, thousands commas
  // allowed), then whitespace, then the note. \s+ tolerates multiple spaces.
  const match = trimmed.match(/^([0-9][0-9.,]*)\s+(.+)$/);

  if (!match) {
    // "150" with no note is a common typo - give a specific hint.
    if (/^[0-9]+(?:[.,][0-9]+)?$/.test(trimmed)) {
      return { ok: false, error: 'You gave me an amount but no note. Try: 150 lunch' };
    }
    return {
      ok: false,
      error: 'I could not parse that. Start with the amount, then the note. Try: 150 lunch',
    };
  }

  // "1,200.50" -> "1200.50" (strip thousands separators, keep the decimal dot).
  const amount = Number(match[1].replace(/,/g, ''));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'The amount must be a positive number. Try: 150 lunch' };
  }
  if (amount > 100000000) {
    return { ok: false, error: 'That amount is too large to be plausible.' };
  }

  // Collapse runs of whitespace inside the note ("rent   for   september").
  const note = match[2].replace(/\s+/g, ' ').trim().slice(0, 200);

  return { ok: true, amount, note };
}

/**
 * Guesses a category for a note using whole-word keywords, then a literal
 * category-name match ("2400 rent"). Whole-word matching means "gas" matches
 * "gas station" but not "gasket". Returns null when nothing matches
 * confidently - the bot then asks the user to pick.
 * @param {string} note
 * @param {{ id: number, name: string }[]} categories the user's categories
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

  // The note may literally be a category name ("2400 rent").
  const bare = note.trim().toLowerCase();
  return (
    categories.find((c) => {
      const name = c.name.toLowerCase();
      return name === bare || name.startsWith(`${bare} `);
    }) ?? null
  );
}

module.exports = { parseExpense, guessCategory };
