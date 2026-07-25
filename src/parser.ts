import { detectPeriod, normalizeText, parseAmountToken, parseDateToken, nowIso } from "./format";
import type { Command, EditField, TransactionType } from "./types";
import {
  EXPENSE_KEYWORDS,
  INCOME_KEYWORDS,
  matchAccountHint,
  matchCategorySeed
} from "./vocab";

const normalize = normalizeText;

const HELP_WORDS = new Set([
  "help",
  "menu",
  "aide",
  "start",
  "commands",
  "hi",
  "hello",
  "hey",
  "bonjour",
  "salut",
  "?"
]);

const RECENT_WORDS = new Set(["last", "recent", "history", "historique", "list", "liste"]);
const SUMMARY_WORDS = new Set(["summary", "report", "resume", "rapport", "overview", "apercu"]);
const BALANCE_WORDS = new Set(["balance", "bal", "solde"]);
const SPEND_LEAD_WORDS = new Set(["spent", "spend", "spending", "depense", "depenser", "depenses"]);
const EDIT_WORDS = new Set(["edit", "modifier", "modify", "change", "corriger"]);
const LAST_WORDS = new Set(["last", "derniere", "dernier", "derniere"]);

// Filler words dropped from a transaction's free-text description.
const DESCRIPTION_STOPWORDS = new Set([
  "on",
  "for",
  "of",
  "the",
  "a",
  "to",
  "at",
  "de",
  "du",
  "la",
  "le",
  "les",
  "pour",
  "sur",
  "en",
  "und"
]);

const AMOUNT_EDIT_WORDS = new Set(["amount", "montant", "sum"]);
const CATEGORY_EDIT_WORDS = new Set(["category", "categorie", "cat"]);
const NOTE_EDIT_WORDS = new Set(["note", "description", "desc", "memo", "libelle", "label"]);

export function parseMessage(rawText: string, now = new Date()): Command {
  const trimmed = rawText.trim();
  if (!trimmed) return { kind: "help" };

  const originalTokens = trimmed.split(/\s+/);
  const tokens = originalTokens.map(normalize);
  const norm = normalize(trimmed);
  const first = tokens[0] ?? "";

  if (HELP_WORDS.has(first) || norm === "?") return { kind: "help" };
  if (BALANCE_WORDS.has(first)) return { kind: "balance" };
  if (RECENT_WORDS.has(first) && !SPEND_LEAD_WORDS.has(first)) return parseRecent(tokens);
  if (SUMMARY_WORDS.has(first)) return { kind: "summary", period: detectPeriod(norm) };
  if (isDeleteLast(tokens, norm)) return { kind: "delete_last" };
  if (EDIT_WORDS.has(first)) return parseEdit(tokens, originalTokens);

  const hasAmount = tokens.some((token) => parseAmountToken(token) !== null);

  // A spend word with no amount is a query ("spent food this month"); with an
  // amount it is a logged expense ("spent 5000 food").
  const isHowMuch = norm.startsWith("how much") || first === "combien";
  if (!hasAmount && (SPEND_LEAD_WORDS.has(first) || isHowMuch)) {
    return parseSpent(tokens, norm);
  }

  if (hasAmount) return parseLog(tokens, originalTokens, norm, now);

  return { kind: "unknown" };
}

function parseRecent(tokens: string[]): Command {
  const numberToken = tokens.slice(1).find((token) => /^\d+$/.test(token));
  const count = numberToken ? Number(numberToken) : 5;
  return { kind: "recent", count: Math.min(Math.max(count, 1), 20) };
}

function isDeleteLast(tokens: string[], norm: string): boolean {
  const first = tokens[0] ?? "";
  if (first === "undo" || first === "annuler") return true;
  if (["delete", "remove", "supprimer", "efface", "effacer", "cancel"].includes(first)) {
    const second = tokens[1] ?? "";
    return LAST_WORDS.has(second) || second === "";
  }
  return norm === "undo last";
}

function parseSpent(tokens: string[], norm: string): Command {
  let categoryId: string | null = null;
  let categoryToken: string | null = null;
  for (const token of tokens) {
    const seed = matchCategorySeed(token);
    if (seed) {
      categoryId = seed.id;
      categoryToken = token;
      break;
    }
  }
  return { kind: "spent", categoryId, categoryToken, period: detectPeriod(norm) };
}

function parseEdit(tokens: string[], originalTokens: string[]): Command {
  // Drop the leading "edit" and an optional "last".
  let index = 1;
  if (LAST_WORDS.has(tokens[index] ?? "")) index += 1;

  const fieldToken = tokens[index] ?? "";
  let field: EditField | null = null;
  if (AMOUNT_EDIT_WORDS.has(fieldToken)) field = "amount";
  else if (CATEGORY_EDIT_WORDS.has(fieldToken)) field = "category";
  else if (NOTE_EDIT_WORDS.has(fieldToken)) field = "note";

  if (!field) return { kind: "unknown" };

  const valueTokens = originalTokens.slice(index + 1);
  const value = field === "note" ? valueTokens.join(" ") : valueTokens[0] ?? "";
  if (!value) return { kind: "unknown" };

  return { kind: "edit_last", field, value };
}

function parseLog(
  tokens: string[],
  originalTokens: string[],
  norm: string,
  now: Date
): Command {
  const consumed = new Set<number>();

  let amount = 0;
  let sign: "+" | "-" | null = null;
  let categoryId: string | null = null;
  let categoryToken: string | null = null;
  let categoryType: TransactionType | null = null;
  let accountHint: string | null = null;
  let transactionDate: string | null = null;

  tokens.forEach((token, index) => {
    if (consumed.has(index)) return;

    if (amount === 0) {
      const parsed = parseAmountToken(token);
      if (parsed && parsed.amount > 0) {
        amount = parsed.amount;
        sign = parsed.sign;
        consumed.add(index);
        return;
      }
    }

    if (!transactionDate) {
      const date = parseDateToken(token, now);
      if (date) {
        transactionDate = date;
        consumed.add(index);
        return;
      }
    }

    if (!accountHint) {
      const account = matchAccountHint(token);
      if (account) {
        accountHint = token;
        consumed.add(index);
        return;
      }
    }

    if (!categoryId) {
      const seed = matchCategorySeed(token);
      if (seed) {
        categoryId = seed.id;
        categoryToken = token;
        categoryType = seed.type;
        consumed.add(index);
        return;
      }
    }
  });

  // Resolve the transaction type: explicit sign > keyword > category > default.
  let type: TransactionType;
  if (sign === "-") type = "expense";
  else if (sign === "+") type = "income";
  else if (tokens.some((token) => EXPENSE_KEYWORDS.has(token))) type = "expense";
  else if (tokens.some((token) => INCOME_KEYWORDS.has(token))) type = "income";
  else if (categoryType) type = categoryType;
  else type = "expense";

  // Build the description from whatever is left over, minus keywords/stopwords.
  const description = originalTokens
    .filter((_, index) => {
      if (consumed.has(index)) return false;
      const token = tokens[index] ?? "";
      if (EXPENSE_KEYWORDS.has(token) || INCOME_KEYWORDS.has(token)) return false;
      if (DESCRIPTION_STOPWORDS.has(token)) return false;
      return true;
    })
    .join(" ")
    .trim();

  return {
    kind: "log",
    type,
    amount,
    categoryId,
    categoryToken,
    accountHint,
    transactionDate: transactionDate ?? nowIso(),
    description
  };
}
