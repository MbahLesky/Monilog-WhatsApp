import { randomUUID } from "node:crypto";
import { adminDb } from "./firebase";
import { config } from "./config";
import { normalizeText, nowIso, periodBounds } from "./format";
import { categorySeedName, matchAccountHint } from "./vocab";
import type {
  AccountDoc,
  CategoryDoc,
  Period,
  SettingsDoc,
  TransactionDoc,
  TransactionType
} from "./types";

// Firestore layout mirrors the web sync engine: users/{uid}/{entity}/{id}, with
// camelCase fields and ISO-string timestamps. Writing here syncs straight into
// the user's local ledger on next pull.
const SETTINGS_ROW_ID = "app-settings";
const DEFAULT_CASH_ACCOUNT_ID = "default-cash";

function userCollection(uid: string, entity: string) {
  return adminDb.collection("users").doc(uid).collection(entity);
}

function isActive(record: { deletedAt?: string | null }): boolean {
  return !record.deletedAt;
}

export async function getCurrency(uid: string): Promise<string> {
  const snap = await userCollection(uid, "settings").doc(SETTINGS_ROW_ID).get();
  const settings = snap.data() as SettingsDoc | undefined;
  return settings?.currencyCode ?? config.defaultCurrency;
}

export async function getAccounts(uid: string): Promise<AccountDoc[]> {
  const snap = await userCollection(uid, "accounts").get();
  return snap.docs.map((doc) => doc.data() as AccountDoc).filter(isActive);
}

export async function getCategories(uid: string): Promise<CategoryDoc[]> {
  const snap = await userCollection(uid, "categories").get();
  return snap.docs.map((doc) => doc.data() as CategoryDoc).filter(isActive);
}

export async function getActiveTransactions(uid: string): Promise<TransactionDoc[]> {
  const snap = await userCollection(uid, "transactions").get();
  return snap.docs.map((doc) => doc.data() as TransactionDoc).filter(isActive);
}

/** Resolve an account hint (or nothing) to a concrete account id to write. */
export async function resolveAccountId(uid: string, hint: string | null): Promise<string> {
  const accounts = await getAccounts(uid);

  if (hint) {
    const normalizedHint = normalizeText(hint);
    const byName = accounts.find((account) => normalizeText(account.name).includes(normalizedHint));
    if (byName) return byName.id;

    const accountHint = matchAccountHint(normalizedHint);
    if (accountHint) {
      if (accountHint.accountType) {
        const byType = accounts.find((account) => account.type === accountHint.accountType);
        if (byType) return byType.id;
      }
      if (accountHint.defaultAccountId) return accountHint.defaultAccountId;
    }
  }

  const preferred = accounts.find((account) => account.isDefault) ?? accounts[0];
  return preferred?.id ?? DEFAULT_CASH_ACCOUNT_ID;
}

/**
 * Resolve the category to store. Prefer a user category (custom or default) whose
 * name matches the typed word and shares the transaction type; otherwise fall back
 * to the shared default id the parser matched.
 */
export async function resolveCategoryId(
  uid: string,
  input: { categoryId: string | null; categoryToken: string | null; type: TransactionType }
): Promise<string | null> {
  if (input.categoryToken) {
    const categories = await getCategories(uid);
    const token = normalizeText(input.categoryToken);
    const match = categories.find(
      (category) => category.type === input.type && normalizeText(category.name).includes(token)
    );
    if (match) return match.id;
  }
  return input.categoryId;
}

export interface CreateTransactionInput {
  type: TransactionType;
  amount: number;
  accountId: string;
  categoryId: string | null;
  description: string;
  transactionDate: string;
}

export async function createTransaction(
  uid: string,
  input: CreateTransactionInput
): Promise<TransactionDoc> {
  const timestamp = nowIso();
  const transaction: TransactionDoc = {
    id: `txn_${randomUUID()}`,
    userId: uid,
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: input.type,
    amount: input.amount,
    description: input.description,
    affectsAccountBalance: true,
    transactionDate: input.transactionDate,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null
  };

  await userCollection(uid, "transactions").doc(transaction.id).set(transaction, { merge: true });
  return transaction;
}

/** The most recently created active transaction, used by undo/edit. */
export async function getLastTransaction(uid: string): Promise<TransactionDoc | null> {
  const transactions = await getActiveTransactions(uid);
  if (transactions.length === 0) return null;
  return transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function getRecentTransactions(uid: string, count: number): Promise<TransactionDoc[]> {
  const transactions = await getActiveTransactions(uid);
  return transactions
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .slice(0, count);
}

export async function softDeleteTransaction(uid: string, id: string): Promise<void> {
  const timestamp = nowIso();
  await userCollection(uid, "transactions")
    .doc(id)
    .set({ deletedAt: timestamp, updatedAt: timestamp }, { merge: true });
}

export async function updateTransaction(
  uid: string,
  id: string,
  patch: Partial<Pick<TransactionDoc, "amount" | "categoryId" | "description">>
): Promise<void> {
  await userCollection(uid, "transactions")
    .doc(id)
    .set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

function balanceContribution(transaction: TransactionDoc): number {
  if (transaction.affectsAccountBalance === false) return 0;
  return transaction.type === "income" ? transaction.amount : -transaction.amount;
}

export async function computeBalance(uid: string): Promise<number> {
  const [accounts, transactions] = await Promise.all([
    getAccounts(uid),
    getActiveTransactions(uid)
  ]);
  const opening = accounts.reduce((sum, account) => sum + (account.openingBalance ?? 0), 0);
  const movement = transactions.reduce((sum, transaction) => sum + balanceContribution(transaction), 0);
  return opening + movement;
}

function withinPeriod(transaction: TransactionDoc, period: Period): boolean {
  const { start, end } = periodBounds(period);
  const date = new Date(transaction.transactionDate);
  return date >= start && date <= end;
}

export interface SpendingQuery {
  categoryId: string | null;
  period: Period;
  type?: TransactionType;
}

export async function computeSpending(uid: string, query: SpendingQuery): Promise<number> {
  const type = query.type ?? "expense";
  const transactions = await getActiveTransactions(uid);
  return transactions
    .filter((transaction) => transaction.type === type)
    .filter((transaction) => (query.categoryId ? transaction.categoryId === query.categoryId : true))
    .filter((transaction) => withinPeriod(transaction, query.period))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  balance: number;
}

export async function computeSummary(uid: string, period: Period): Promise<PeriodSummary> {
  const [transactions, balance] = await Promise.all([
    getActiveTransactions(uid),
    computeBalance(uid)
  ]);
  const inPeriod = transactions.filter((transaction) => withinPeriod(transaction, period));
  const income = inPeriod
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = inPeriod
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return { income, expense, net: income - expense, balance };
}

/** Look up a category name for display from either the user's set or the seeds. */
export async function categoryNameFor(uid: string, categoryId: string | null): Promise<string> {
  if (!categoryId) return "Uncategorized";
  const categories = await getCategories(uid);
  const match = categories.find((category) => category.id === categoryId);
  if (match) return match.name;
  // The user's categories may not be synced yet; fall back to the shared default
  // name the bot knows for this id before giving up.
  return categorySeedName(categoryId) ?? "Uncategorized";
}
