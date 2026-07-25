import { describe, expect, it } from "vitest";
import { parseMessage } from "./parser";
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
