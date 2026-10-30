import { supabase } from "./supabase";
import { config } from "./config";
import { normalizeText, nowIso, periodBounds } from "./format";
import { categorySeedName, matchAccountHint } from "./vocab";
import type {
  AccountDoc,
  CategoryDoc,
  Period,
  TransactionDoc,
  TransactionType
} from "./types";

export async function getCurrency(uid: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_currency")
    .eq("id", uid)
    .maybeSingle();

  if (error || !data) {
    return config.defaultCurrency;
  }

  return data.preferred_currency ?? config.defaultCurrency;
}

export async function getAccounts(uid: string): Promise<AccountDoc[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type, opening_balance_minor, is_default, display_order, deleted_at")
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    openingBalance: Number(row.opening_balance_minor || 0) / 100,
    isDefault: row.is_default,
    displayOrder: row.display_order,
    deletedAt: row.deleted_at
  }));
}

export async function getCategories(uid: string): Promise<CategoryDoc[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, is_default, deleted_at")
    .eq("user_id", uid)
    .is("deleted_at", null);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    isDefault: row.is_default,
    deletedAt: row.deleted_at
  }));
}

export async function resolveAccountId(uid: string, hint: string | null): Promise<string> {
  const accounts = await getAccounts(uid);

  if (hint) {
    const normalizedHint = normalizeText(hint);
    const byName = accounts.find((account) => normalizeText(account.name).includes(normalizedHint));
    if (byName) return byName.id;

    const accountHint = matchAccountHint(normalizedHint);
    if (accountHint?.accountType) {
      const byType = accounts.find((account) => account.type === accountHint.accountType);
      if (byType) return byType.id;
    }
  }

  const preferred = accounts.find((account) => account.isDefault) ?? accounts[0];
  if (preferred) return preferred.id;

  // Fallback: create default cash account if none exists
  const { data: newAccount } = await supabase
    .from("accounts")
    .insert({
      user_id: uid,
      preset_key: "cash",
      name: "Cash",
      type: "cash",
      opening_balance_minor: 0,
      currency_code: config.defaultCurrency,
      is_default: true,
      display_order: 0
    })
    .select("id")
    .single();

  return newAccount?.id ?? "";
}

export async function resolveCategoryId(
  uid: string,
  input: { categoryId: string | null; categoryToken: string | null; type: TransactionType }
): Promise<string | null> {
  const categories = await getCategories(uid);

  if (input.categoryToken) {
    const token = normalizeText(input.categoryToken);
    const match = categories.find(
      (category) => category.type === input.type && normalizeText(category.name).includes(token)
    );
    if (match) return match.id;
  }

  if (input.categoryId) {
    const match = categories.find((c) => c.id === input.categoryId);
    if (match) return match.id;
  }

  return null;
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
  const amountMinor = Math.round(input.amount * 100);

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: uid,
      account_id: input.accountId,
      category_id: input.categoryId || null,
      type: input.type,
      amount_minor: amountMinor,
      description: input.description,
      affects_account_balance: true,
      transaction_date: input.transactionDate
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create transaction: ${error?.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    accountId: data.account_id,
    categoryId: data.category_id,
    type: data.type,
    amount: Number(data.amount_minor) / 100,
    description: data.description,
    affectsAccountBalance: data.affects_account_balance,
    transactionDate: data.transaction_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    deletedAt: data.deleted_at
  };
}

export async function getLastTransaction(uid: string): Promise<TransactionDoc | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    accountId: data.account_id,
    categoryId: data.category_id,
    type: data.type,
    amount: Number(data.amount_minor) / 100,
    description: data.description,
    affectsAccountBalance: data.affects_account_balance,
    transactionDate: data.transaction_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    deletedAt: data.deleted_at
  };
}

export async function getRecentTransactions(uid: string, count: number): Promise<TransactionDoc[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(count);

  if (error || !data) return [];

  return data.map((t) => ({
    id: t.id,
    userId: t.user_id,
    accountId: t.account_id,
    categoryId: t.category_id,
    type: t.type,
    amount: Number(t.amount_minor) / 100,
    description: t.description,
    affectsAccountBalance: t.affects_account_balance,
    transactionDate: t.transaction_date,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    deletedAt: t.deleted_at
  }));
}

export async function softDeleteTransaction(uid: string, id: string): Promise<void> {
  const timestamp = nowIso();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: timestamp, updated_at: timestamp })
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    throw new Error(`Failed to delete transaction: ${error.message}`);
  }
}

export async function updateTransaction(
  uid: string,
  id: string,
  patch: Partial<Pick<TransactionDoc, "amount" | "categoryId" | "description">>
): Promise<void> {
  const updatePayload: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.amount !== undefined) updatePayload.amount_minor = Math.round(patch.amount * 100);
  if (patch.categoryId !== undefined) updatePayload.category_id = patch.categoryId;
  if (patch.description !== undefined) updatePayload.description = patch.description;

  const { error } = await supabase
    .from("transactions")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    throw new Error(`Failed to update transaction: ${error.message}`);
  }
}

export async function computeBalance(uid: string): Promise<number> {
  const [accountsRes, txRes, transfersRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("opening_balance_minor")
      .eq("user_id", uid)
      .is("deleted_at", null),
    supabase
      .from("transactions")
      .select("type, amount_minor, affects_account_balance")
      .eq("user_id", uid)
      .is("deleted_at", null),
    supabase
      .from("transfers")
      .select("source_fee_minor, destination_fee_minor")
      .eq("user_id", uid)
      .is("deleted_at", null)
  ]);

  const openingMinor = (accountsRes.data ?? []).reduce(
    (sum, acc) => sum + BigInt(acc.opening_balance_minor || 0),
    0n
  );

  const txMovementMinor = (txRes.data ?? []).reduce((sum, tx) => {
    if (tx.affects_account_balance === false) return sum;
    const amt = BigInt(tx.amount_minor || 0);
    return tx.type === "income" ? sum + amt : sum - amt;
  }, 0n);

  const feesMinor = (transfersRes.data ?? []).reduce(
    (sum, t) => sum + BigInt(t.source_fee_minor || 0) + BigInt(t.destination_fee_minor || 0),
    0n
  );

  const totalMinor = openingMinor + txMovementMinor - feesMinor;
  return Number(totalMinor) / 100;
}

export interface SpendingQuery {
  categoryId: string | null;
  period: Period;
  type?: TransactionType;
}

export async function computeSpending(uid: string, query: SpendingQuery): Promise<number> {
  const { start, end } = periodBounds(query.period);
  let q = supabase
    .from("transactions")
    .select("amount_minor")
    .eq("user_id", uid)
    .eq("type", query.type ?? "expense")
    .is("deleted_at", null)
    .gte("transaction_date", start.toISOString())
    .lte("transaction_date", end.toISOString());

  if (query.categoryId) {
    q = q.eq("category_id", query.categoryId);
  }

  const { data, error } = await q;
  if (error || !data) return 0;

  const sumMinor = data.reduce((acc, row) => acc + BigInt(row.amount_minor || 0), 0n);
  return Number(sumMinor) / 100;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  balance: number;
}

export async function computeSummary(uid: string, period: Period): Promise<PeriodSummary> {
  const { start, end } = periodBounds(period);
  const [txRes, balance] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount_minor")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .gte("transaction_date", start.toISOString())
      .lte("transaction_date", end.toISOString()),
    computeBalance(uid)
  ]);

  let incomeMinor = 0n;
  let expenseMinor = 0n;

  for (const row of txRes.data ?? []) {
    const amt = BigInt(row.amount_minor || 0);
    if (row.type === "income") incomeMinor += amt;
    else if (row.type === "expense") expenseMinor += amt;
  }

  const income = Number(incomeMinor) / 100;
  const expense = Number(expenseMinor) / 100;
  return { income, expense, net: income - expense, balance };
}

export async function categoryNameFor(uid: string, categoryId: string | null): Promise<string> {
  if (!categoryId) return "Uncategorized";
  const categories = await getCategories(uid);
  const match = categories.find((category) => category.id === categoryId);
  if (match) return match.name;
  return categorySeedName(categoryId) ?? "Uncategorized";
}
