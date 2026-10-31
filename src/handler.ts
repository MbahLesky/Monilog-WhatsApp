import { executeCommand } from "./commands";
import { linkPhoneNumberWithCode, resolveUid, toE164 } from "./identity";
import { getCurrency } from "./ledger";
import { parseMessage } from "./parser";
import { parseReceiptImage, parseVoiceNote } from "./gemini";

export interface InboundMessage {
  from: string;
  text?: string;
  mediaBuffer?: Buffer;
  mediaMimeType?: string;
}

/**
 * Turn one inbound WhatsApp message into a reply string.
 * Resolves the sender to a Moniilog account, parses text, receipts, or voice notes,
 * and executes the resulting ledger command.
 */
export async function handleMessage(message: InboundMessage): Promise<string> {
  const e164 = toE164(message.from);

  try {
    const rawText = message.text?.trim() ?? "";

    // Check if the user is attempting to link their phone number via a 6-digit code
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
      const reply = await executeCommand(uid, currency, {
        kind: "log",
        type: "expense",
        amount: receipt.amount,
        categoryId: null,
        categoryToken: receipt.category ?? null,
        accountHint: null,
        transactionDate: new Date().toISOString(),
        description: receipt.note || "Receipt expense",
      });
      return `🧾 *Receipt Processed!*\n${reply}`;
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
        const reply = await executeCommand(uid, currency, {
          kind: "log",
          type: voice.type === "income" ? "income" : "expense",
          amount: voice.amount,
          categoryId: null,
          categoryToken: voice.category ?? null,
          accountHint: null,
          transactionDate: new Date().toISOString(),
          description: voice.note ?? "Voice note transaction",
        });
        return `🎙️ *Voice Note Transcribed!*\n${reply}`;
      }
    }

    // 3. Process Text Message
    const command = parseMessage(rawText);
    return await executeCommand(uid, currency, command);
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
