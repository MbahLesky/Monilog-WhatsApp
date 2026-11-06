import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPendingStore } from "./confirmation";
import { handleMessage } from "./handler";

vi.mock("./identity", () => ({
  toE164: (phone: string) => phone,
  resolveUid: vi.fn(async (phone: string) => {
    if (phone === "+237699999999") return "mock-user-1";
    return null;
  }),
  linkPhoneNumberWithCode: vi.fn(async () => ({ success: true, message: "Linked!" }))
}));

const mockTransactions: any[] = [];
let mockBalance = 100000;

vi.mock("./ledger", () => ({
  getCurrency: vi.fn(async () => "XAF"),
  resolveAccountId: vi.fn(async () => "acc-cash"),
  resolveCategoryId: vi.fn(async (_uid, input) => {
    if (input.categoryToken === "food" || input.categoryId === "cat-exp-food") return "cat-food";
    if (input.categoryToken === "taxi" || input.categoryId === "cat-exp-transport") return "cat-taxi";
    if (input.categoryToken === "salary" || input.categoryId === "cat-inc-salary") return "cat-salary";
    return null;
  }),
  categoryNameFor: vi.fn(async (_uid, categoryId) => {
    if (categoryId === "cat-food") return "Food & Dining";
    if (categoryId === "cat-taxi") return "Transportation";
    if (categoryId === "cat-salary") return "Salary";
    return "Uncategorized";
  }),
  createTransaction: vi.fn(async (_uid, input) => {
    mockTransactions.push(input);
    if (input.type === "income") mockBalance += input.amount;
    else mockBalance -= input.amount;
    return { id: "tx-new", ...input };
  }),
  computeBalance: vi.fn(async () => mockBalance),
  computeSpending: vi.fn(async () => 5000),
  computeSummary: vi.fn(async () => ({
    income: 50000,
    expense: 7000,
    net: 43000,
    balance: mockBalance
  })),
  getLastTransaction: vi.fn(async () => null)
}));

describe("WhatsApp Handler Multi-Line & Confirmation Workflow", () => {
  beforeEach(() => {
    resetPendingStore();
    mockTransactions.length = 0;
    mockBalance = 100000;
  });

  it("stages a multi-line message and asks for confirmation with calculated additions", async () => {
    const inbound = {
      from: "+237699999999",
      text: "-5000 food lunch\n-2000 taxi\n+50000 salary"
    };

    const reply = await handleMessage(inbound);

    // Should NOT have created transactions in DB yet
    expect(mockTransactions).toHaveLength(0);

    // Should ask for confirmation and show itemized breakdown + additions
    expect(reply).toContain("📋 *Confirm 3 Transactions*");
    expect(reply).toContain("1. 🔴 -5,000 FCFA · Food & Dining (lunch)");
    expect(reply).toContain("2. 🔴 -2,000 FCFA · Transportation");
    expect(reply).toContain("3. 🟢 +50,000 FCFA · Salary");
    expect(reply).toContain("➕ *Total Income:* +50,000 FCFA");
    expect(reply).toContain("➖ *Total Expenses:* -7,000 FCFA");
    expect(reply).toContain("📊 *Net Total:* +43,000 FCFA");
    expect(reply).toContain("Reply *YES* (or *1*) to save.");
  });

  it("saves all transactions and displays new balance when user confirms with YES or 1", async () => {
    const sender = "+237699999999";

    // 1. Send transactions
    await handleMessage({
      from: sender,
      text: "-5000 food\n-2000 taxi"
    });
    expect(mockTransactions).toHaveLength(0);

    // 2. Reply 1 to confirm
    const confirmReply = await handleMessage({
      from: sender,
      text: "1"
    });

    // Transactions must now be written to the ledger
    expect(mockTransactions).toHaveLength(2);
    expect(mockTransactions[0].amount).toBe(5000);
    expect(mockTransactions[1].amount).toBe(2000);

    // Confirmation message returned
    expect(confirmReply).toContain("✅ *2 Transactions Saved!*");
    expect(confirmReply).toContain("🔴 -5,000 FCFA · Food & Dining");
    expect(confirmReply).toContain("🔴 -2,000 FCFA · Transportation");
    expect(confirmReply).toContain("💰 *Updated Balance:* 93,000 FCFA");
  });

  it("discards staged transactions when user replies NO or cancel", async () => {
    const sender = "+237699999999";

    // 1. Send transactions
    await handleMessage({
      from: sender,
      text: "-5000 food"
    });
    expect(mockTransactions).toHaveLength(0);

    // 2. Reply cancel
    const cancelReply = await handleMessage({
      from: sender,
      text: "cancel"
    });

    expect(mockTransactions).toHaveLength(0);
    expect(cancelReply).toContain("❌ *Transaction cancelled.* Nothing was saved.");
  });

  it("answers query commands during confirmation and reminds user of pending entries", async () => {
    const sender = "+237699999999";

    await handleMessage({
      from: sender,
      text: "-5000 food"
    });

    const balanceReply = await handleMessage({
      from: sender,
      text: "balance"
    });

    expect(balanceReply).toContain("💰 Your balance is 100,000 FCFA.");
    expect(balanceReply).toContain("📌 *Pending Confirmation:*");
    expect(balanceReply).toContain("Reply *YES* (or *1*) to save");
  });

  it("returns line-specific error when a multi-line message has an invalid line", async () => {
    const sender = "+237699999999";

    const reply = await handleMessage({
      from: sender,
      text: "-5000 food\njust walking outside\n-2000 taxi"
    });

    expect(mockTransactions).toHaveLength(0);
    expect(reply).toContain("⚠️ Could not parse all transaction lines:");
    expect(reply).toContain("Line 2");
    expect(reply).toContain("just walking outside");
  });
});
