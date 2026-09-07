// Reporting arithmetic, kept apart from ledger.ts so it can be tested without
// Firebase Admin (which ledger.ts initializes at import time).
import { periodBounds } from "./format";
import type { Period, TransactionDoc } from "./types";

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  balance: number;
}

export function withinPeriod(
  transaction: TransactionDoc,
  period: Period,
  now = new Date()
): boolean {
  const { start, end } = periodBounds(period, now);
  const date = new Date(transaction.transactionDate);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

export function summarize(
  transactions: TransactionDoc[],
  period: Period,
  balance: number,
  now = new Date()
): PeriodSummary {
  const inPeriod = transactions.filter((transaction) => withinPeriod(transaction, period, now));
  const income = inPeriod
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = inPeriod
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return { income, expense, net: income - expense, balance };
}
