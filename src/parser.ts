import { detectPeriod, normalizeText, parseAmountToken, parseDateToken, nowIso } from "./format";
import type { Command, EditField, LogCommand, TransactionType } from "./types";
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

/**
 * Strips leading list numbering (1., 1)), bullet points (*, •), or dash bullets (- ).
 * A negative amount without space (e.g. -5000) is untouched.
 */
export function cleanLinePrefix(line: string): string {
  return line.replace(/^(\d+[\.\)]|\*|•|-)\s+/, "").trim();
}

export function parseSingleLine(rawText: string, now = new Date()): Command {
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

export function parseMessage(rawText: string, now = new Date()): Command {
  const trimmed = rawText.trim();
  if (!trimmed) return { kind: "help" };

  const rawLines = trimmed.split(/\r?\n/);
  const nonEmptyLines: string[] = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    nonEmptyLines.push(cleanLinePrefix(line));
  }

  if (nonEmptyLines.length === 0) return { kind: "help" };

  if (nonEmptyLines.length === 1 && nonEmptyLines[0]) {
    return parseSingleLine(nonEmptyLines[0], now);
  }

  // Multiple lines: check if all are log commands
  const commands: LogCommand[] = [];
  for (const line of nonEmptyLines) {
    const cmd = parseSingleLine(line, now);
    if (cmd.kind === "log") {
      commands.push(cmd);
    } else {
      return { kind: "unknown" };
    }
  }

  return { kind: "batch_log", commands };
}

export type MultiLineResult =
  | { kind: "batch_log"; commands: LogCommand[] }
  | { kind: "command"; command: Command }
  | { kind: "error"; message: string };

/**
 * Parses single or multi-line messages with detailed line-by-line feedback.
 * If all valid lines are transaction log entries, returns a batch_log.
 * If a single command is passed, returns that command.
 * If multiple lines are sent and some fail validation, returns an informative error.
 */
export function parseMultiLineMessage(rawText: string, now = new Date()): MultiLineResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { kind: "command", command: { kind: "help" } };

  const rawLines = trimmed.split(/\r?\n/);
  const activeLines: { text: string; lineNum: number }[] = [];

  rawLines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;
    activeLines.push({ text: cleanLinePrefix(line), lineNum: idx + 1 });
  });

  if (activeLines.length === 0) {
    return { kind: "command", command: { kind: "help" } };
  }

  // Single line
  if (activeLines.length === 1 && activeLines[0]) {
    const singleCmd = parseSingleLine(activeLines[0].text, now);
    if (singleCmd.kind === "log") {
      return { kind: "batch_log", commands: [singleCmd] };
    }
    return { kind: "command", command: singleCmd };
  }

  // Multiple lines
  const commands: LogCommand[] = [];
  const errors: string[] = [];

  activeLines.forEach(({ text, lineNum }) => {
    const cmd = parseSingleLine(text, now);
    if (cmd.kind === "log") {
      commands.push(cmd);
    } else {
      errors.push(`• Line ${lineNum} ("${text}"): could not detect amount or valid transaction format.`);
    }
  });

  if (errors.length > 0) {
    return {
      kind: "error",
      message:
        `⚠️ Could not parse all transaction lines:\n` +
        errors.join("\n") +
        `\n\n*Example format:*\n-5000 food\n-2000 taxi\n+15000 salary`
    };
  }

  return { kind: "batch_log", commands };
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
