// Ledger record shapes mirrored from the web app (Monilog - Web/src/types).
// These MUST match the Firestore document shape the web sync engine reads/writes,
// stored at users/{uid}/{entity}/{id} in camelCase (see sync-engine.ts). The
// bot writes/reads the same documents so entries round-trip cleanly.

export type TransactionType = "income" | "expense";

export type AccountType =
  | "cash"
  | "bank"
  | "mobile_money"
  | "wallet"
  | "savings"
  | "other";

export interface TransactionDoc {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  description: string;
  affectsAccountBalance: boolean;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AccountDoc {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  isDefault: boolean;
  displayOrder: number;
  deletedAt?: string | null;
}

export interface CategoryDoc {
  id: string;
  name: string;
  type: TransactionType;
  isDefault: boolean;
  deletedAt?: string | null;
}

export interface SettingsDoc {
  id: string;
  currencyCode?: string;
  language?: string;
  deletedAt?: string | null;
}

// ── Parsed commands ────────────────────────────────────────────────────────

export type Period = "today" | "week" | "month" | "year" | "all";

export interface LogCommand {
  kind: "log";
  type: TransactionType;
  amount: number;
  /** Resolved from the shared default vocabulary, if any. */
  categoryId: string | null;
  /** Raw word the user typed for the category, for custom-category matching. */
  categoryToken: string | null;
  accountHint: string | null;
  transactionDate: string;
  description: string;
}

export interface BalanceCommand {
  kind: "balance";
}

export interface SpentCommand {
  kind: "spent";
  categoryId: string | null;
  categoryToken: string | null;
  period: Period;
}

export interface SummaryCommand {
  kind: "summary";
  /** null when the message named no period: report all time, month and week. */
  period: Period | null;
}

export interface RecentCommand {
  kind: "recent";
  count: number;
}

export interface DeleteLastCommand {
  kind: "delete_last";
}

export type EditField = "amount" | "category" | "note";

export interface EditLastCommand {
  kind: "edit_last";
  field: EditField;
  value: string;
}

export interface HelpCommand {
  kind: "help";
}

export interface UnknownCommand {
  kind: "unknown";
}

export type Command =
  | LogCommand
  | BalanceCommand
  | SpentCommand
  | SummaryCommand
  | RecentCommand
  | DeleteLastCommand
  | EditLastCommand
  | HelpCommand
  | UnknownCommand;
