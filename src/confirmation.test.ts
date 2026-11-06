import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingConfirmation,
  formatConfirmationPrompt,
  formatExecutedSummary,
  getPendingConfirmation,
  isCancelToken,
  isConfirmToken,
  resetPendingStore,
  setPendingConfirmation,
  type StagedTransaction
} from "./confirmation";

describe("Confirmation Tokens", () => {
  it("recognizes affirmative / confirmation tokens", () => {
    expect(isConfirmToken("yes")).toBe(true);
    expect(isConfirmToken("YES")).toBe(true);
    expect(isConfirmToken("1")).toBe(true);
    expect(isConfirmToken("oui")).toBe(true);
    expect(isConfirmToken("OK")).toBe(true);
    expect(isConfirmToken("confirm")).toBe(true);
    expect(isConfirmToken("valider")).toBe(true);
    expect(isConfirmToken("yes!")).toBe(true);
    expect(isConfirmToken("1.")).toBe(true);
  });

  it("recognizes rejection / cancellation tokens", () => {
    expect(isCancelToken("no")).toBe(true);
    expect(isCancelToken("NO")).toBe(true);
    expect(isCancelToken("0")).toBe(true);
    expect(isCancelToken("non")).toBe(true);
    expect(isCancelToken("cancel")).toBe(true);
    expect(isCancelToken("annuler")).toBe(true);
    expect(isCancelToken("discard")).toBe(true);
    expect(isCancelToken("no.")).toBe(true);
  });

  it("returns false for non-decision strings", () => {
    expect(isConfirmToken("hello")).toBe(false);
    expect(isCancelToken("balance")).toBe(false);
    expect(isConfirmToken("5000 food")).toBe(false);
  });
});

describe("Confirmation Prompt Formatting", () => {
  const singleExpense: StagedTransaction[] = [
    {
      type: "expense",
      amount: 5000,
      accountId: "acc-1",
      categoryId: "cat-1",
      categoryName: "Food & Dining",
      description: "team lunch",
      transactionDate: "2026-07-19T10:00:00.000Z"
    }
  ];

  const multipleMixed: StagedTransaction[] = [
    {
      type: "income",
      amount: 50000,
      accountId: "acc-1",
      categoryId: "cat-salary",
      categoryName: "Salary",
      description: "Salary",
      transactionDate: "2026-07-19T10:00:00.000Z"
    },
    {
      type: "expense",
      amount: 5000,
      accountId: "acc-1",
      categoryId: "cat-food",
      categoryName: "Food & Dining",
      description: "Groceries",
      transactionDate: "2026-07-19T10:00:00.000Z"
    },
    {
      type: "expense",
      amount: 2000,
      accountId: "acc-1",
      categoryId: "cat-transport",
      categoryName: "Transportation",
      description: "Taxi",
      transactionDate: "2026-07-19T10:00:00.000Z"
    }
  ];

  it("formats prompt for single transaction with clear action instructions", () => {
    const prompt = formatConfirmationPrompt(singleExpense, "XAF");
    expect(prompt).toContain("📋 *Confirm Transaction*");
    expect(prompt).toContain("🔴 -5,000 FCFA · Food & Dining (team lunch)");
    expect(prompt).toContain("➖ Total Expense: *-5,000 FCFA*");
    expect(prompt).toContain("Reply *YES* (or *1*) to save.");
    expect(prompt).toContain("Reply *NO* (or *cancel*) to discard.");
  });

  it("calculates additions and net total for multiple mixed transactions", () => {
    const prompt = formatConfirmationPrompt(multipleMixed, "XAF");
    expect(prompt).toContain("📋 *Confirm 3 Transactions*");
    expect(prompt).toContain("1. 🟢 +50,000 FCFA · Salary");
    expect(prompt).toContain("2. 🔴 -5,000 FCFA · Food & Dining (Groceries)");
    expect(prompt).toContain("3. 🔴 -2,000 FCFA · Transportation (Taxi)");
    expect(prompt).toContain("➕ *Total Income:* +50,000 FCFA");
    expect(prompt).toContain("➖ *Total Expenses:* -7,000 FCFA");
    expect(prompt).toContain("📊 *Net Total:* +43,000 FCFA");
  });

  it("includes replaced notice when previous unconfirmed entry existed", () => {
    const prompt = formatConfirmationPrompt(singleExpense, "USD", { replaced: true });
    expect(prompt).toContain("_(Replaced previous unconfirmed entry)_");
  });
});

describe("Executed Summary Formatting", () => {
  it("formats single executed transaction summary", () => {
    const summary = formatExecutedSummary(
      [
        {
          type: "expense",
          amount: 2500,
          accountId: "acc-1",
          categoryId: "cat-1",
          categoryName: "Transport",
          description: "taxi",
          transactionDate: "2026-07-19T10:00:00.000Z"
        }
      ],
      "XAF",
      47500
    );
    expect(summary).toContain("✅ *Transaction Saved!*");
    expect(summary).toContain("🔴 -2,500 FCFA · Transport (taxi)");
    expect(summary).toContain("💰 *Updated Balance:* 47,500 FCFA");
  });

  it("formats multiple executed transactions summary", () => {
    const summary = formatExecutedSummary(
      [
        {
          type: "expense",
          amount: 1000,
          accountId: "acc-1",
          categoryId: null,
          categoryName: "Expense",
          description: "coffee",
          transactionDate: "2026-07-19T10:00:00.000Z"
        },
        {
          type: "income",
          amount: 20000,
          accountId: "acc-1",
          categoryId: null,
          categoryName: "Income",
          description: "freelance",
          transactionDate: "2026-07-19T10:00:00.000Z"
        }
      ],
      "XAF",
      69000
    );
    expect(summary).toContain("✅ *2 Transactions Saved!*");
    expect(summary).toContain("1. 🔴 -1,000 FCFA · Expense (coffee)");
    expect(summary).toContain("2. 🟢 +20,000 FCFA · Income (freelance)");
    expect(summary).toContain("💰 *Updated Balance:* 69,000 FCFA");
  });
});

describe("Pending Store Session Lifecycle", () => {
  beforeEach(() => {
    resetPendingStore();
  });

  it("stores, retrieves, and clears pending sessions", () => {
    const dummy: StagedTransaction[] = [
      {
        type: "expense",
        amount: 3000,
        accountId: "acc-1",
        categoryId: null,
        categoryName: "Expense",
        description: "",
        transactionDate: "2026-07-19T10:00:00.000Z"
      }
    ];

    setPendingConfirmation("user-123", {
      transactions: dummy,
      currency: "XAF",
      createdAt: Date.now()
    });

    const retrieved = getPendingConfirmation("user-123");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.transactions).toHaveLength(1);

    clearPendingConfirmation("user-123");
    expect(getPendingConfirmation("user-123")).toBeNull();
  });

  it("expires pending sessions older than 15 minutes", () => {
    const dummy: StagedTransaction[] = [
      {
        type: "expense",
        amount: 3000,
        accountId: "acc-1",
        categoryId: null,
        categoryName: "Expense",
        description: "",
        transactionDate: "2026-07-19T10:00:00.000Z"
      }
    ];

    const sixteenMinutesAgo = Date.now() - 16 * 60 * 1000;
    setPendingConfirmation("user-old", {
      transactions: dummy,
      currency: "XAF",
      createdAt: sixteenMinutesAgo
    });

    expect(getPendingConfirmation("user-old")).toBeNull();
  });
});
