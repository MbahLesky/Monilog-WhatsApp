import type { Period } from "./types";

/** Lowercase and strip accents so "dépensé" matches "depense". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Currency symbols mirror the web app's SUPPORTED_CURRENCIES table.
const CURRENCY_SYMBOLS: Record<string, string> = {
  XAF: "FCFA",
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦"
};

// Currencies with no minor unit in everyday use (amounts shown as whole numbers).
const ZERO_DECIMAL_CURRENCIES = new Set(["XAF", "XOF", "NGN"]);

export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const rounded = fractionDigits === 0 ? Math.round(amount) : amount;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(rounded);
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  // Franc symbols read naturally after the amount ("5,000 FCFA"); others before.
  if (code === "XAF" || code === "XOF" || code === "NGN") {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}

const AMOUNT_PATTERN = /^([+-])?(\d+(?:[.,]\d+)?)(k|m)?(?:f|fcfa|cfa|xaf|frs?)?$/i;

export interface ParsedAmount {
  amount: number;
  sign: "+" | "-" | null;
}

/**
 * Parse one token as a money amount. Supports optional sign, decimals with "."
 * or ",", and "k"/"m" multipliers, plus a trailing currency word (5000fcfa).
 * Returns null if the token is not an amount.
 */
export function parseAmountToken(token: string): ParsedAmount | null {
  const match = AMOUNT_PATTERN.exec(token);
  if (!match) return null;

  const [, sign, digits, multiplier] = match;
  let amount = Number(digits!.replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  if (multiplier?.toLowerCase() === "k") amount *= 1_000;
  if (multiplier?.toLowerCase() === "m") amount *= 1_000_000;

  return {
    amount: Math.abs(amount),
    sign: sign === "+" ? "+" : sign === "-" ? "-" : null
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Human date label: "today", "yesterday", or "19 Jul 2026". */
export function formatDateLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (isSameDay(date, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "yesterday";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6
};

/** A date at local noon, to keep it stable across timezone conversions. */
function isoAtNoon(date: Date): string {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  return noon.toISOString();
}

/**
 * Parse a single token as a date, relative to `now`. Understands today/yesterday
 * (EN + FR), weekday names (most recent past occurrence), and dd/mm[/yyyy].
 * Returns an ISO string or null if the token is not a date.
 */
export function parseDateToken(token: string, now = new Date()): string | null {
  const word = token.toLowerCase();

  if (["today", "aujourdhui", "auj", "now"].includes(word)) {
    return isoAtNoon(now);
  }
  if (["yesterday", "hier"].includes(word)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return isoAtNoon(d);
  }

  if (word in WEEKDAYS) {
    const target = WEEKDAYS[word]!;
    const d = new Date(now);
    let diff = (d.getDay() - target + 7) % 7;
    if (diff === 0) diff = 7; // "monday" means last monday, not today
    d.setDate(d.getDate() - diff);
    return isoAtNoon(d);
  }

  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(word);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  return null;
}

export interface PeriodBounds {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Bounds for a reporting period, both ends inclusive.
 *
 * The end is the end of today rather than this instant: an entry the user dated
 * today is part of today whatever time they ask about it, and the apps write a
 * transaction date that can easily sit later in the day than the moment a
 * summary is requested.
 */
export function periodBounds(period: Period, now = new Date()): PeriodBounds {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  switch (period) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end, label: "today" };
    }
    case "week": {
      const start = new Date(now);
      const day = (start.getDay() + 6) % 7; // Monday = 0
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: "this week" };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end, label: "this year" };
    }
    case "all": {
      return { start: new Date(0), end, label: "all time" };
    }
    case "month":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end, label: "this month" };
    }
  }
}

const PERIOD_WORDS: Record<string, Period> = {
  today: "today",
  aujourdhui: "today",
  week: "week",
  "this week": "week",
  semaine: "week",
  month: "month",
  "this month": "month",
  mois: "month",
  year: "year",
  "this year": "year",
  annee: "year",
  all: "all",
  total: "all",
  tout: "all"
};

/** Detect a period phrase inside a lowercased message; defaults to "month". */
/**
 * The period the message asked for, or null when it named none. Callers that
 * need a period regardless use detectPeriod; `summary` uses the null to tell
 * "summary" (report every window) apart from "summary this month".
 */
export function detectPeriodOrNull(text: string): Period | null {
  for (const [phrase, period] of Object.entries(PERIOD_WORDS)) {
    if (text.includes(phrase)) return period;
  }
  return null;
}

export function detectPeriod(text: string): Period {
  return detectPeriodOrNull(text) ?? "month";
}
