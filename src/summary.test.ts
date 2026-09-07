import { describe, expect, it } from "vitest";
import { periodBounds } from "./format";
import { parseMessage } from "./parser";
import { summarize } from "./summary";
import type { TransactionDoc, TransactionType } from "./types";

// Local-time constructors throughout: period bounds are local (start of month,
// Monday of this week), so building fixtures in UTC would make these tests pass
// or fail depending on the machine's timezone.
function at(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month, day, hour).toISOString();
}

function txn(type: TransactionType, amount: number, transactionDate: string): TransactionDoc {
  return {
    id: `txn_${transactionDate}_${amount}`,
    userId: "user-1",
    accountId: "default-cash",
    categoryId: null,
    type,
    amount,
    description: "",
    affectsAccountBalance: true,
    transactionDate,
    createdAt: transactionDate,
    updatedAt: transactionDate,
    deletedAt: null
  };
}

describe("summarize", () => {
  // September 2026: the 7th is a Monday, so "this week" starts that morning.
  const now = new Date(2026, 8, 7, 10);

  const ledger = [
    txn("income", 250_000, at(2026, 7, 28)), // salary, late August
    txn("income", 30_000, at(2026, 8, 2)), // early September
    txn("expense", 12_000, at(2026, 8, 3)),
    txn("expense", 5_000, at(2026, 8, 7, 18)) // later today
  ];

  it("counts income from earlier months under all time", () => {
    const summary = summarize(ledger, "all", 0, now);
    expect(summary.income).toBe(280_000);
    expect(summary.expense).toBe(17_000);
    expect(summary.net).toBe(263_000);
  });

  it("counts only this month's rows under month", () => {
    const summary = summarize(ledger, "month", 0, now);
    expect(summary.income).toBe(30_000);
    expect(summary.expense).toBe(17_000);
  });

  // The reported bug: a bare `summary` reported this month alone, so a user
  // whose only income arrived in August saw "Income: 0" in September.
  it("reports zero income for a month whose income all predates it", () => {
    const august = summarize(ledger, "month", 0, new Date(2026, 7, 30, 10));
    const allTime = summarize(ledger, "all", 0, new Date(2026, 7, 30, 10));
    expect(summarize([ledger[0]!], "month", 0, now).income).toBe(0);
    expect(august.income).toBe(250_000);
    expect(allTime.income).toBe(250_000);
  });

  it("includes an entry dated later today when asked in the morning", () => {
    const summary = summarize(ledger, "today", 0, now);
    expect(summary.expense).toBe(5_000);
  });

  it("ignores an unparseable transaction date rather than counting it", () => {
    const broken = [txn("income", 9_000, "not-a-date")];
    expect(summarize(broken, "all", 0, now).income).toBe(0);
  });
});

describe("periodBounds", () => {
  it("runs to the end of today, not to this instant", () => {
    const { end } = periodBounds("month", new Date(2026, 8, 7, 10));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

describe("summary command parsing", () => {
  it("leaves the period unset when the message names none", () => {
    const command = parseMessage("summary");
    expect(command).toMatchObject({ kind: "summary", period: null });
  });

  it("keeps an explicit period", () => {
    expect(parseMessage("summary this week")).toMatchObject({ kind: "summary", period: "week" });
    expect(parseMessage("summary total")).toMatchObject({ kind: "summary", period: "all" });
    expect(parseMessage("summary today")).toMatchObject({ kind: "summary", period: "today" });
  });
});
