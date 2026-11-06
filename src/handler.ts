import { executeCommand } from "./commands";
import { linkPhoneNumberWithCode, resolveUid, toE164 } from "./identity";
import { computeBalance, createTransaction, getCurrency } from "./ledger";
import { parseMessage, parseMultiLineMessage } from "./parser";
import { parseReceiptImage, parseVoiceNote } from "./gemini";
import {
  clearPendingConfirmation,
  formatConfirmationPrompt,
  formatExecutedSummary,
  getPendingConfirmation,
  isCancelToken,
  isConfirmToken,
  setPendingConfirmation,
  stageTransactions
} from "./confirmation";
import type { LogCommand } from "./types";

export interface InboundMessage {
  from: string;
  text?: string;
  mediaBuffer?: Buffer;
  mediaMimeType?: string;
}

/**
 * Turn one inbound WhatsApp message into a reply string.
 * Resolves the sender to a Moniilog account, parses text, receipts, or voice notes,
 * provides confirmation flows for staged transactions, and executes resulting commands.
 */
export async function handleMessage(message: InboundMessage): Promise<string> {
  const e164 = toE164(message.from);

  try {
    const rawText = message.text?.trim() ?? "";

    // 0. Check if the user is attempting to link their phone number via a 6-digit code
    const linkMatch = rawText.match(/^link\s+(\d{6})$/i);
    if (linkMatch && linkMatch[1]) {
      const result = await linkPhoneNumberWithCode(linkMatch[1], e164);
      return result.message;
    }

    const uid = await resolveUid(e164);
    if (!uid) return unlinkedText(e164);

    const currency = await getCurrency(uid);

    // 1. Process Multimodal Receipt Image
    if (message.mediaBuffer && message.mediaMimeType?.startsWith("image/")) {
      const receipt = await parseReceiptImage(message.mediaBuffer, message.mediaMimeType);
      if (!receipt) {
        return "📸 Received image, but could not detect a valid receipt or total amount. Please ensure the receipt is legible and try again.";
      }
      const logCmd: LogCommand = {
        kind: "log",
        type: "expense",
        amount: receipt.amount,
        categoryId: null,
        categoryToken: receipt.category ?? null,
        accountHint: null,
        transactionDate: new Date().toISOString(),
        description: receipt.note || "Receipt expense"
      };
      const staged = await stageTransactions(uid, currency, [logCmd]);
      setPendingConfirmation(uid, {
        transactions: staged,
        currency,
        createdAt: Date.now()
      });
      return `🧾 *Receipt Detected!*\n\n${formatConfirmationPrompt(staged, currency)}`;
    }

    // 2. Process Voice Note Audio
    if (message.mediaBuffer && message.mediaMimeType?.startsWith("audio/")) {
      const voice = await parseVoiceNote(message.mediaBuffer, message.mediaMimeType);
      if (!voice) {
        return "🎙️ Received audio, but could not transcribe financial details. Please try speaking clearly or send text.";
      }
      if (voice.type === "query" && voice.queryType) {
        return await executeCommand(uid, currency, { kind: voice.queryType as never });
      }
      if (voice.amount) {
        const logCmd: LogCommand = {
          kind: "log",
          type: voice.type === "income" ? "income" : "expense",
          amount: voice.amount,
          categoryId: null,
          categoryToken: voice.category ?? null,
          accountHint: null,
          transactionDate: new Date().toISOString(),
          description: voice.note ?? "Voice note transaction"
        };
        const staged = await stageTransactions(uid, currency, [logCmd]);
        setPendingConfirmation(uid, {
          transactions: staged,
          currency,
          createdAt: Date.now()
        });
        return `🎙️ *Voice Note Transcribed!*\n\n${formatConfirmationPrompt(staged, currency)}`;
      }
    }

    // 3. Check Pending Confirmation
    const pending = getPendingConfirmation(uid);

    if (pending) {
      // 3a. User Confirmed
      if (isConfirmToken(rawText)) {
        clearPendingConfirmation(uid);
        for (const tx of pending.transactions) {
          await createTransaction(uid, {
            type: tx.type,
            amount: tx.amount,
            accountId: tx.accountId,
            categoryId: tx.categoryId,
            description: tx.description,
            transactionDate: tx.transactionDate
          });
        }
        const newBalance = await computeBalance(uid);
        return formatExecutedSummary(pending.transactions, currency, newBalance);
      }

      // 3b. User Cancelled
      if (isCancelToken(rawText)) {
        clearPendingConfirmation(uid);
        return "❌ *Transaction cancelled.* Nothing was saved.";
      }

      // 3c. User asks a query (balance, spent, summary, recent, help)
      const parsedSingle = parseMessage(rawText);
      if (["balance", "spent", "summary", "recent", "help"].includes(parsedSingle.kind)) {
        const queryResult = await executeCommand(uid, currency, parsedSingle);
        return (
          `${queryResult}\n\n` +
          `━━━━━━━━━━━━━━━\n` +
          `📌 *Pending Confirmation:*\n` +
          `You have ${pending.transactions.length} transaction(s) waiting to be saved.\n` +
          `Reply *YES* (or *1*) to save, or *NO* (or *cancel*) to discard.`
        );
      }
    }

    // 4. Process Multi-Line or Single Text Message
    const parsed = parseMultiLineMessage(rawText);

    if (parsed.kind === "error") {
      return parsed.message;
    }

    if (parsed.kind === "batch_log") {
      const staged = await stageTransactions(uid, currency, parsed.commands);
      const hadPrevious = !!pending;
      setPendingConfirmation(uid, {
        transactions: staged,
        currency,
        createdAt: Date.now()
      });
      return formatConfirmationPrompt(staged, currency, { replaced: hadPrevious });
    }

    // 5. Unrecognized input while confirmation is pending
    if (pending && parsed.kind === "command" && parsed.command.kind === "unknown") {
      return (
        `❓ *Confirmation Needed*\n\n` +
        `You have ${pending.transactions.length} transaction(s) awaiting confirmation.\n\n` +
        `• Reply *YES* (or *1*) to save.\n` +
        `• Reply *NO* (or *cancel*) to discard.\n` +
        `• Or send new transaction line(s) to replace.`
      );
    }

    // 6. Non-log command execution (balance, help, undo, edit, etc.)
    return await executeCommand(uid, currency, parsed.command);
  } catch (error) {
    console.error(`Failed handling message from ${e164}`, error);
    return "⚠️ Something went wrong on our side. Please try again in a moment.";
  }
}

function unlinkedText(e164: string): string {
  return (
    `👋 Welcome to *Moniilog*!\n\n` +
    `This number (${e164}) is not connected to a Moniilog account yet.\n\n` +
    `*How to connect:*\n` +
    `1. Sign in with this phone number in the Moniilog app, or\n` +
    `2. In the Moniilog app, go to Settings → Link WhatsApp, and reply here with: *LINK <6-digit-code>*\n\n` +
    `Once linked, you can log expenses like \`-5000 food\`, send photos of receipts, or send voice notes anytime!`
  );
}
