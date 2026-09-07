import { formatDateLabel, formatMoney, normalizeText, parseAmountToken, periodBounds } from "./format";
import {
  categoryNameFor,
  computeBalance,
  computeSpending,
  computeSummaries,
  computeSummary,
  createTransaction,
  getCategories,
  getLastTransaction,
  getRecentTransactions,
  resolveAccountId,
  resolveCategoryId,
  softDeleteTransaction,
  updateTransaction
} from "./ledger";
import type { PeriodSummary } from "./ledger";
import { categorySeedName, matchCategorySeed } from "./vocab";
import type {
  Command,
  EditLastCommand,
  LogCommand,
  Period,
  RecentCommand,
  SpentCommand,
  SummaryCommand,
  TransactionDoc
} from "./types";

function signOf(type: TransactionDoc["type"]): string {
  return type === "income" ? "+" : "-";
}

export async function executeCommand(
  uid: string,
  currency: string,
  command: Command
): Promise<string> {
  switch (command.kind) {
    case "help":
      return helpText();
    case "log":
      return handleLog(uid, currency, command);
    case "balance":
      return handleBalance(uid, currency);
    case "spent":
      return handleSpent(uid, currency, command);
    case "summary":
      return handleSummary(uid, currency, command);
    case "recent":
      return handleRecent(uid, currency, command);
    case "delete_last":
      return handleDeleteLast(uid, currency);
    case "edit_last":
      return handleEditLast(uid, currency, command);
    case "unknown":
    default:
      return unknownText();
  }
}

async function handleLog(uid: string, currency: string, command: LogCommand): Promise<string> {
  const accountId = await resolveAccountId(uid, command.accountHint);
  const categoryId = await resolveCategoryId(uid, {
    categoryId: command.categoryId,
    categoryToken: command.categoryToken,
    type: command.type
  });

  const categoryName = await categoryNameFor(uid, categoryId);
  const description = command.description || (categoryId ? categoryName : "");

  await createTransaction(uid, {
    type: command.type,
    amount: command.amount,
    accountId,
    categoryId,
    description,
    transactionDate: command.transactionDate
  });

  const balance = await computeBalance(uid);
  const heading = command.type === "income" ? "✅ Income logged" : "✅ Expense logged";
  const noteLine =
    description && description.toLowerCase() !== categoryName.toLowerCase()
      ? `\n📝 ${description}`
      : "";

  return (
    `${heading}\n` +
    `${signOf(command.type)}${formatMoney(command.amount, currency)} · ${categoryName}` +
    noteLine +
    `\n🗓 ${formatDateLabel(command.transactionDate)}` +
    `\n💰 Balance: ${formatMoney(balance, currency)}`
  );
}

async function handleBalance(uid: string, currency: string): Promise<string> {
  const balance = await computeBalance(uid);
  return `💰 Your balance is ${formatMoney(balance, currency)}.`;
}

async function handleSpent(uid: string, currency: string, command: SpentCommand): Promise<string> {
  const amount = await computeSpending(uid, {
    categoryId: command.categoryId,
    period: command.period,
    type: "expense"
  });
  const { label } = periodBounds(command.period);
  const categoryName = command.categoryId ? await categoryNameFor(uid, command.categoryId) : null;
  const scope = categoryName ? ` on ${categoryName}` : "";
  return `📉 You spent ${formatMoney(amount, currency)}${scope} ${label}.`;
}

/** Periods a bare `summary` reports, widest first. */
const OVERVIEW_PERIODS: Period[] = ["all", "month", "week"];

function summaryLines(summary: PeriodSummary, currency: string): string {
  return (
    `📈 Income: ${formatMoney(summary.income, currency)}\n` +
    `📉 Expenses: ${formatMoney(summary.expense, currency)}\n` +
    `➖ Net: ${formatMoney(summary.net, currency)}`
  );
}

function titleCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function handleSummary(
  uid: string,
  currency: string,
  command: SummaryCommand
): Promise<string> {
  // A period the user named is the only one they asked about.
  if (command.period) {
    const summary = await computeSummary(uid, command.period);
    const { label } = periodBounds(command.period);
    return (
      `📊 Summary (${label})\n` +
      `${summaryLines(summary, currency)}\n` +
      `💰 Balance: ${formatMoney(summary.balance, currency)}`
    );
  }

  // A bare `summary` used to report this month alone, which reads as an empty
  // ledger to anyone whose income landed before the 1st. Show every window.
  const summaries = await computeSummaries(uid, OVERVIEW_PERIODS);
  const blocks = OVERVIEW_PERIODS.map((period) => {
    const summary = summaries.get(period)!;
    return `*${titleCase(periodBounds(period).label)}*\n${summaryLines(summary, currency)}`;
  });
  // Balance is the same whatever the window; take it off any of them.
  const balance = summaries.get("all")!.balance;

  return (
    `📊 *Summary*\n💰 Balance: ${formatMoney(balance, currency)}\n\n` +
    `${blocks.join("\n\n")}\n\n` +
    "_Ask for one window with_ `summary this month`_,_ `summary this week`_,_ `summary today`_._"
  );
}

async function handleRecent(uid: string, currency: string, command: RecentCommand): Promise<string> {
  const [transactions, categories] = await Promise.all([
    getRecentTransactions(uid, command.count),
    getCategories(uid)
  ]);
  if (transactions.length === 0) return "🧾 No transactions yet.";

  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  const lines = transactions.map((transaction) => {
    const { categoryId } = transaction;
    // User categories first, then the shared default name, then a safe fallback.
    const categoryName = categoryId
      ? nameById.get(categoryId) ?? categorySeedName(categoryId) ?? "Uncategorized"
      : "Uncategorized";
    return (
      `${signOf(transaction.type)}${formatMoney(transaction.amount, currency)} · ` +
      `${categoryName} · ${formatDateLabel(transaction.transactionDate)}`
    );
  });

  return `🧾 Last ${transactions.length}:\n${lines.join("\n")}`;
}

async function handleDeleteLast(uid: string, currency: string): Promise<string> {
  const last = await getLastTransaction(uid);
  if (!last) return "🤷 Nothing to undo.";

  await softDeleteTransaction(uid, last.id);
  const categoryName = await categoryNameFor(uid, last.categoryId);
  const balance = await computeBalance(uid);
  return (
    `↩️ Removed ${signOf(last.type)}${formatMoney(last.amount, currency)} · ${categoryName}.\n` +
    `💰 Balance: ${formatMoney(balance, currency)}`
  );
}

async function handleEditLast(
  uid: string,
  currency: string,
  command: EditLastCommand
): Promise<string> {
  const last = await getLastTransaction(uid);
  if (!last) return "🤷 Nothing to edit.";

  if (command.field === "amount") {
    const parsed = parseAmountToken(normalizeText(command.value));
    if (!parsed || parsed.amount <= 0) return "⚠️ I couldn't read that amount. Try `edit amount 6000`.";
    await updateTransaction(uid, last.id, { amount: parsed.amount });
    const balance = await computeBalance(uid);
    return (
      `✏️ Updated amount to ${signOf(last.type)}${formatMoney(parsed.amount, currency)}.\n` +
      `💰 Balance: ${formatMoney(balance, currency)}`
    );
  }

  if (command.field === "category") {
    const seed = matchCategorySeed(normalizeText(command.value));
    const categoryId = await resolveCategoryId(uid, {
      categoryId: seed?.id ?? null,
      categoryToken: command.value,
      type: last.type
    });
    if (!categoryId) {
      return `⚠️ I don't know the category "${command.value}". Try food, transport, bills…`;
    }
    await updateTransaction(uid, last.id, { categoryId });
    const categoryName = await categoryNameFor(uid, categoryId);
    return `✏️ Moved last entry to ${categoryName}.`;
  }

  // note
  await updateTransaction(uid, last.id, { description: command.value });
  return `✏️ Updated note to "${command.value}".`;
}

/** The full message reference on the marketing site, linked from help. */
const GUIDE_URL = "https://monilog.vercel.app/whatsapp-guide";

function helpText(): string {
  return (
    "📒 *Monilog* — log money by chat.\n\n" +
    "*Add:*\n" +
    "• `-5000 food` (expense)\n" +
    "• `+50000 salary` (income)\n" +
    "• `2000 taxi yesterday cash`\n" +
    "Amounts: `5k` = 5000. Optional date (today, yesterday, 12/07) and account (cash, bank, momo).\n\n" +
    "*Ask:*\n" +
    "• `balance`\n" +
    "• `spent food this month`\n" +
    "• `summary` (all time, month, week)\n" +
    "• `summary this week` for one window\n" +
    "• `last 5`\n\n" +
    "*Fix:*\n" +
    "• `undo` (remove last)\n" +
    "• `edit amount 6000`\n" +
    "• `edit category transport`\n\n" +
    `Every message you can send: ${GUIDE_URL}\n` +
    "Type `help` anytime."
  );
}

function unknownText(): string {
  return "🤔 I didn't catch that. Send an amount like `-5000 food`, or type `help`.";
}
