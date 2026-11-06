import { formatDateLabel, formatMoney, normalizeText } from "./format";
import { categoryNameFor, resolveAccountId, resolveCategoryId } from "./ledger";
import type { LogCommand, TransactionType } from "./types";

export interface StagedTransaction {
  type: TransactionType;
  amount: number;
  accountId: string;
  categoryId: string | null;
  categoryName: string;
  description: string;
  transactionDate: string;
}

export interface PendingConfirmation {
  transactions: StagedTransaction[];
  currency: string;
  createdAt: number;
}

const CONFIRMATION_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const pendingStore = new Map<string, PendingConfirmation>();

export function getPendingConfirmation(uid: string): PendingConfirmation | null {
  const session = pendingStore.get(uid);
  if (!session) return null;
  if (Date.now() - session.createdAt > CONFIRMATION_TTL_MS) {
    pendingStore.delete(uid);
    return null;
  }
  return session;
}

export function setPendingConfirmation(uid: string, session: PendingConfirmation): void {
  pendingStore.set(uid, session);
}

export function clearPendingConfirmation(uid: string): void {
  pendingStore.delete(uid);
}

export function resetPendingStore(): void {
  pendingStore.clear();
}

const CONFIRM_TOKENS = new Set([
  "yes",
  "y",
  "oui",
  "o",
  "ok",
  "okay",
  "confirm",
  "confirmer",
  "confirme",
  "confirme",
  "confirmé",
  "save",
  "1",
  "enregistrer",
  "valider",
  "yes please"
]);

const CANCEL_TOKENS = new Set([
  "no",
  "n",
  "non",
  "cancel",
  "annuler",
  "annule",
  "annule",
  "annulé",
  "discard",
  "0",
  "stop",
  "rejet",
  "rejeter"
]);

export function isConfirmToken(text: string): boolean {
  const norm = normalizeText(text.replace(/[!.,?]/g, "")).trim();
  return CONFIRM_TOKENS.has(norm);
}

export function isCancelToken(text: string): boolean {
  const norm = normalizeText(text.replace(/[!.,?]/g, "")).trim();
  return CANCEL_TOKENS.has(norm);
}

export async function stageTransactions(
  uid: string,
  currency: string,
  commands: LogCommand[]
): Promise<StagedTransaction[]> {
  const staged: StagedTransaction[] = [];

  for (const cmd of commands) {
    const accountId = await resolveAccountId(uid, cmd.accountHint);
    const categoryId = await resolveCategoryId(uid, {
      categoryId: cmd.categoryId,
      categoryToken: cmd.categoryToken,
      type: cmd.type
    });

    const categoryName = await categoryNameFor(uid, categoryId);
    const description = cmd.description || (categoryId ? categoryName : "");

    staged.push({
      type: cmd.type,
      amount: cmd.amount,
      accountId,
      categoryId,
      categoryName: categoryName || (cmd.type === "income" ? "Income" : "Expense"),
      description,
      transactionDate: cmd.transactionDate
    });
  }

  return staged;
}

export function formatConfirmationPrompt(
  transactions: StagedTransaction[],
  currency: string,
  options?: { replaced?: boolean }
): string {
  const count = transactions.length;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    if (tx.type === "income") {
      totalIncome += tx.amount;
    } else {
      totalExpense += tx.amount;
    }
  }

  const lines = transactions.map((tx, idx) => {
    const icon = tx.type === "income" ? "🟢" : "🔴";
    const sign = tx.type === "income" ? "+" : "-";
    const amountStr = `${sign}${formatMoney(tx.amount, currency)}`;
    const note =
      tx.description && tx.description.toLowerCase() !== tx.categoryName.toLowerCase()
        ? ` (${tx.description})`
        : "";
    const isToday = formatDateLabel(tx.transactionDate) === "today";
    const dateSuffix = isToday ? "" : ` · 🗓 ${formatDateLabel(tx.transactionDate)}`;

    return count > 1
      ? `${idx + 1}. ${icon} ${amountStr} · ${tx.categoryName}${note}${dateSuffix}`
      : `${icon} ${amountStr} · ${tx.categoryName}${note}${dateSuffix}`;
  });

  let additionsSummary = "";
  if (count > 1) {
    const rows: string[] = [];
    if (totalIncome > 0) {
      rows.push(`➕ *Total Income:* +${formatMoney(totalIncome, currency)}`);
    }
    if (totalExpense > 0) {
      rows.push(`➖ *Total Expenses:* -${formatMoney(totalExpense, currency)}`);
    }
    if (totalIncome > 0 && totalExpense > 0) {
      const net = totalIncome - totalExpense;
      const netSign = net >= 0 ? "+" : "-";
      rows.push(`📊 *Net Total:* ${netSign}${formatMoney(Math.abs(net), currency)}`);
    }
    additionsSummary = `\n━━━━━━━━━━━━━━━\n${rows.join("\n")}\n━━━━━━━━━━━━━━━`;
  } else if (transactions[0]) {
    const tx = transactions[0];
    const label = tx.type === "income" ? "➕ Total Income" : "➖ Total Expense";
    const sign = tx.type === "income" ? "+" : "-";
    additionsSummary = `\n━━━━━━━━━━━━━━━\n${label}: *${sign}${formatMoney(tx.amount, currency)}*\n━━━━━━━━━━━━━━━`;
  }

  const title =
    count > 1 ? `📋 *Confirm ${count} Transactions*` : `📋 *Confirm Transaction*`;
  const replacedNotice = options?.replaced ? `\n_(Replaced previous unconfirmed entry)_\n` : `\n`;

  return (
    `${title}${replacedNotice}\n` +
    lines.join("\n") +
    `\n` +
    additionsSummary +
    `\n\nReply *YES* (or *1*) to save.` +
    `\nReply *NO* (or *cancel*) to discard.`
  );
}

export function formatExecutedSummary(
  transactions: StagedTransaction[],
  currency: string,
  newBalance: number
): string {
  const count = transactions.length;
  const heading =
    count > 1 ? `✅ *${count} Transactions Saved!*` : `✅ *Transaction Saved!*`;

  const lines = transactions.map((tx, idx) => {
    const icon = tx.type === "income" ? "🟢" : "🔴";
    const sign = tx.type === "income" ? "+" : "-";
    const amountStr = `${sign}${formatMoney(tx.amount, currency)}`;
    const note =
      tx.description && tx.description.toLowerCase() !== tx.categoryName.toLowerCase()
        ? ` (${tx.description})`
        : "";
    const isToday = formatDateLabel(tx.transactionDate) === "today";
    const dateSuffix = isToday ? "" : ` · 🗓 ${formatDateLabel(tx.transactionDate)}`;

    return count > 1
      ? `${idx + 1}. ${icon} ${amountStr} · ${tx.categoryName}${note}${dateSuffix}`
      : `${icon} ${amountStr} · ${tx.categoryName}${note}${dateSuffix}`;
  });

  return (
    `${heading}\n\n` +
    lines.join("\n") +
    `\n\n💰 *Updated Balance:* ${formatMoney(newBalance, currency)}`
  );
}
