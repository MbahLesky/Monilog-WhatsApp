import { describe, expect, it } from "vitest";
import { cleanLinePrefix, parseMessage, parseMultiLineMessage } from "./parser";
import type { LogCommand } from "./types";

const NOW = new Date(2026, 6, 19, 10, 0, 0); // 19 Jul 2026, local

function log(text: string): LogCommand {
  const command = parseMessage(text, NOW);
  if (command.kind !== "log") throw new Error(`expected log, got ${command.kind}`);
  return command;
}

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

describe("parseMessage — logging", () => {
  it("parses a signed expense with a category", () => {
    const command = log("-5000 food");
    expect(command.type).toBe("expense");
    expect(command.amount).toBe(5000);
    expect(command.categoryId).toBe("cat-exp-food");
  });

  it("parses a signed income with a category", () => {
    const command = log("+50000 salary");
    expect(command.type).toBe("income");
    expect(command.amount).toBe(50000);
    expect(command.categoryId).toBe("cat-inc-salary");
  });

  it("infers income from an income category without a sign", () => {
    const command = log("50000 salary");
    expect(command.type).toBe("income");
  });

  it("defaults to expense when nothing else decides", () => {
    const command = log("1200 stuff");
    expect(command.type).toBe("expense");
  });

  it("expands k and m multipliers", () => {
    expect(log("5k food").amount).toBe(5000);
    expect(log("2.5k transport").amount).toBe(2500);
    expect(log("1m salary").amount).toBe(1_000_000);
  });

  it("captures account and date hints and cleans the description", () => {
    const command = log("2000 taxi yesterday cash");
    expect(command.amount).toBe(2000);
    expect(command.categoryId).toBe("cat-exp-transport");
    expect(command.accountHint).toBe("cash");
    expect(localDate(command.transactionDate)).toBe("2026-07-18");
  });

  it("drops filler words and keyword verbs, keeps the leftover note", () => {
    const command = log("spent 3000 on transport office");
    expect(command.type).toBe("expense");
    expect(command.amount).toBe(3000);
    expect(command.categoryId).toBe("cat-exp-transport");
    // "spent" (verb) and "on" (filler) are dropped; "transport" is consumed as
    // the category; only the genuine note remains.
    expect(command.description).toBe("office");
  });

  it("consumes a category alias used as the only descriptive word", () => {
    const command = log("spent 3000 on lunch");
    expect(command.categoryId).toBe("cat-exp-food");
    expect(command.description).toBe("");
  });

  it("infers income from a keyword verb", () => {
    const command = log("received 20000 gift");
    expect(command.type).toBe("income");
    expect(command.categoryId).toBe("cat-inc-gift");
  });

  it("understands FR keywords and accents", () => {
    const command = log("depense 4000 nourriture");
    expect(command.type).toBe("expense");
    expect(command.categoryId).toBe("cat-exp-food");
  });
});

describe("parseMessage — commands", () => {
  it("recognizes balance", () => {
    expect(parseMessage("balance").kind).toBe("balance");
    expect(parseMessage("solde").kind).toBe("balance");
  });

  it("recognizes a spending query (no amount)", () => {
    const command = parseMessage("spent food this month");
    expect(command).toEqual({
      kind: "spent",
      categoryId: "cat-exp-food",
      categoryToken: "food",
      period: "month"
    });
  });

  it("recognizes summary with a period", () => {
    expect(parseMessage("summary this year")).toEqual({ kind: "summary", period: "year" });
  });

  it("recognizes recent with a count", () => {
    expect(parseMessage("last 3")).toEqual({ kind: "recent", count: 3 });
    expect(parseMessage("recent")).toEqual({ kind: "recent", count: 5 });
  });

  it("recognizes undo / delete last", () => {
    expect(parseMessage("undo").kind).toBe("delete_last");
    expect(parseMessage("delete last").kind).toBe("delete_last");
  });

  it("recognizes edit commands", () => {
    expect(parseMessage("edit amount 6000")).toEqual({
      kind: "edit_last",
      field: "amount",
      value: "6000"
    });
    expect(parseMessage("edit category transport")).toEqual({
      kind: "edit_last",
      field: "category",
      value: "transport"
    });
    expect(parseMessage("edit note team lunch")).toEqual({
      kind: "edit_last",
      field: "note",
      value: "team lunch"
    });
  });

  it("treats greetings and blanks as help", () => {
    expect(parseMessage("help").kind).toBe("help");
    expect(parseMessage("hello").kind).toBe("help");
    expect(parseMessage("   ").kind).toBe("help");
  });

  it("falls back to unknown when there is no amount or command", () => {
    expect(parseMessage("just some random text").kind).toBe("unknown");
  });
});

describe("cleanLinePrefix", () => {
  it("strips numbered prefixes like 1. and 2)", () => {
    expect(cleanLinePrefix("1. -5000 food")).toBe("-5000 food");
    expect(cleanLinePrefix("2) 2000 taxi")).toBe("2000 taxi");
  });

  it("strips bullet points like * and •", () => {
    expect(cleanLinePrefix("* -1500 lunch")).toBe("-1500 lunch");
    expect(cleanLinePrefix("• 3000 fuel")).toBe("3000 fuel");
  });

  it("strips dash bullets with space but preserves negative amounts", () => {
    expect(cleanLinePrefix("- 5000 groceries")).toBe("5000 groceries");
    expect(cleanLinePrefix("-5000 groceries")).toBe("-5000 groceries");
  });

  it("does not corrupt decimal numbers like 2.5k", () => {
    expect(cleanLinePrefix("2.5k transport")).toBe("2.5k transport");
  });
});

describe("parseMultiLineMessage", () => {
  it("parses multiple transaction lines in one message", () => {
    const text = "-5000 food\n-2000 taxi\n+50000 salary";
    const result = parseMultiLineMessage(text, NOW);
    expect(result.kind).toBe("batch_log");
    if (result.kind !== "batch_log") return;

    expect(result.commands).toHaveLength(3);
    expect(result.commands[0]!.amount).toBe(5000);
    expect(result.commands[0]!.type).toBe("expense");
    expect(result.commands[0]!.categoryId).toBe("cat-exp-food");

    expect(result.commands[1]!.amount).toBe(2000);
    expect(result.commands[1]!.type).toBe("expense");
    expect(result.commands[1]!.categoryId).toBe("cat-exp-transport");

    expect(result.commands[2]!.amount).toBe(50000);
    expect(result.commands[2]!.type).toBe("income");
    expect(result.commands[2]!.categoryId).toBe("cat-inc-salary");
  });

  it("handles numbered and bulleted lists gracefully", () => {
    const text = "1. -5000 food\n2. -2500 fuel\n3. +10000 refund";
    const result = parseMultiLineMessage(text, NOW);
    expect(result.kind).toBe("batch_log");
    if (result.kind !== "batch_log") return;
    expect(result.commands).toHaveLength(3);
    expect(result.commands[0]!.amount).toBe(5000);
    expect(result.commands[1]!.amount).toBe(2500);
    expect(result.commands[2]!.amount).toBe(10000);
  });

  it("ignores blank lines and comment headers starting with # or //", () => {
    const text = "# Today's spending\n-1200 snacks\n\n// evening\n-3000 dinner\n";
    const result = parseMultiLineMessage(text, NOW);
    expect(result.kind).toBe("batch_log");
    if (result.kind !== "batch_log") return;
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]!.amount).toBe(1200);
    expect(result.commands[1]!.amount).toBe(3000);
  });

  it("returns error detailing which lines failed validation", () => {
    const text = "-5000 food\nbought shoes without price\n-2000 taxi";
    const result = parseMultiLineMessage(text, NOW);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("Line 2");
    expect(result.message).toContain("bought shoes without price");
  });

  it("wraps single transaction into batch_log for unified confirmation", () => {
    const result = parseMultiLineMessage("-3500 lunch", NOW);
    expect(result.kind).toBe("batch_log");
    if (result.kind !== "batch_log") return;
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]!.amount).toBe(3500);
  });

  it("delegates single non-log queries directly to command", () => {
    const result = parseMultiLineMessage("balance", NOW);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.kind).toBe("balance");
  });
});
