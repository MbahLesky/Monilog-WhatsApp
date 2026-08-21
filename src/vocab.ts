import type { TransactionType } from "./types";

// Mirrors the shared default categories in the web app
// (Monilog - Web/src/lib/constants.ts DEFAULT_CATEGORY_SEEDS) and the Flutter
// app's system_defaults.dart — same ids, so entries logged here classify
// identically across every surface.
export interface CategorySeed {
  id: string;
  name: string;
  type: TransactionType;
  /** Lowercased words that map to this category (EN + FR + common slang). */
  aliases: string[];
}

export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    id: "cat-inc-salary",
    name: "Salary",
    type: "income",
    aliases: ["salary", "wage", "wages", "pay", "paycheck", "salaire", "paie"]
  },
  {
    id: "cat-inc-freelance",
    name: "Freelance",
    type: "income",
    aliases: ["freelance", "gig", "contract", "client"]
  },
  {
    id: "cat-inc-business",
    name: "Business",
    type: "income",
    aliases: ["business", "sales", "sale", "profit", "revenue", "affaires", "vente", "ventes"]
  },
  {
    id: "cat-inc-gift",
    name: "Gift",
    type: "income",
    aliases: ["gift", "present", "donation", "cadeau", "don"]
  },
  {
    id: "cat-exp-food",
    name: "Food",
    type: "expense",
    aliases: [
      "food",
      "lunch",
      "dinner",
      "breakfast",
      "meal",
      "groceries",
      "grocery",
      "restaurant",
      "eat",
      "nourriture",
      "repas",
      "manger",
      "chop"
    ]
  },
  {
    id: "cat-exp-transport",
    name: "Transport",
    type: "expense",
    aliases: [
      "transport",
      "taxi",
      "bus",
      "fare",
      "fuel",
      "gas",
      "petrol",
      "uber",
      "moto",
      "bike",
      "essence",
      "carburant"
    ]
  },
  {
    id: "cat-exp-bills",
    name: "Bills",
    type: "expense",
    aliases: [
      "bills",
      "bill",
      "rent",
      "electricity",
      "power",
      "water",
      "internet",
      "wifi",
      "subscription",
      "facture",
      "factures",
      "loyer",
      "eau",
      "electricite"
    ]
  },
  {
    id: "cat-exp-shopping",
    name: "Shopping",
    type: "expense",
    aliases: ["shopping", "clothes", "clothing", "shoes", "achats", "vetements", "habits"]
  },
  {
    id: "cat-exp-health",
    name: "Health",
    type: "expense",
    aliases: [
      "health",
      "medicine",
      "medication",
      "hospital",
      "doctor",
      "pharmacy",
      "clinic",
      "sante",
      "medecin",
      "hopital",
      "pharmacie"
    ]
  },
  {
    id: "cat-exp-airtime",
    name: "Airtime",
    type: "expense",
    aliases: [
      "airtime",
      "credit",
      "data",
      "recharge",
      "topup",
      "mtn",
      "orange",
      "forfait",
      "unites"
    ]
  }
];

const CATEGORY_ALIAS_INDEX: Map<string, CategorySeed> = (() => {
  const index = new Map<string, CategorySeed>();
  for (const seed of CATEGORY_SEEDS) {
    index.set(seed.name.toLowerCase(), seed);
    for (const alias of seed.aliases) index.set(alias, seed);
  }
  return index;
})();

/** Resolve a single lowercased word to a shared default category, if known. */
export function matchCategorySeed(word: string): CategorySeed | null {
  return CATEGORY_ALIAS_INDEX.get(word) ?? null;
}

const CATEGORY_SEEDS_BY_ID = new Map(CATEGORY_SEEDS.map((seed) => [seed.id, seed]));

/** Display name for a shared default category id (e.g. "cat-exp-food" → "Food"). */
export function categorySeedName(categoryId: string): string | null {
  return CATEGORY_SEEDS_BY_ID.get(categoryId)?.name ?? null;
}

// Account keyword hints. These map to the two shared default accounts
// (default-cash, default-bank) or to a broad type the ledger resolves against
// the user's actual accounts (e.g. a mobile-money account they created).
export interface AccountHint {
  aliases: string[];
  /** A default account id to fall back to, or an account type to search for. */
  defaultAccountId?: string;
  accountType?: string;
}

export const ACCOUNT_HINTS: AccountHint[] = [
  {
    aliases: ["cash", "espece", "especes", "liquide"],
    defaultAccountId: "default-cash",
    accountType: "cash"
  },
  {
    aliases: ["bank", "banque", "account"],
    defaultAccountId: "default-bank",
    accountType: "bank"
  },
  {
    aliases: ["momo", "mobilemoney", "mtn", "orange", "om", "wave", "wallet"],
    accountType: "mobile_money"
  }
];

export function matchAccountHint(word: string): AccountHint | null {
  return ACCOUNT_HINTS.find((hint) => hint.aliases.includes(word)) ?? null;
}

// Keyword sets that steer transaction type when no +/- sign is present.
export const EXPENSE_KEYWORDS = new Set([
  "spent",
  "spend",
  "paid",
  "pay",
  "bought",
  "buy",
  "cost",
  "depense",
  "depenser",
  "paye",
  "achete"
]);

export const INCOME_KEYWORDS = new Set([
  "received",
  "receive",
  "got",
  "earned",
  "earn",
  "income",
  "recu",
  "gagne",
  "recois"
]);
