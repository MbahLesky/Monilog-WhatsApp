import { executeCommand } from "./commands";
import { resolveUid, toE164 } from "./identity";
import { getCurrency } from "./ledger";
import { parseMessage } from "./parser";

export interface InboundMessage {
  from: string;
  text: string;
}

/**
 * Turn one inbound WhatsApp message into a reply string. Resolves the sender to a
 * Monilog account, parses the message, and runs the resulting command. Never
 * throws — failures become a friendly reply so the webhook always answers.
 */
export async function handleMessage(message: InboundMessage): Promise<string> {
  const e164 = toE164(message.from);

  try {
    const uid = await resolveUid(e164);
    if (!uid) return unlinkedText(e164);

    const currency = await getCurrency(uid);
    const command = parseMessage(message.text);
    return await executeCommand(uid, currency, command);
  } catch (error) {
    console.error(`Failed handling message from ${e164}`, error);
    return "⚠️ Something went wrong on our side. Please try again in a moment.";
  }
}

function unlinkedText(e164: string): string {
  return (
    `👋 Welcome to *Monilog*!\n\n` +
    `This number (${e164}) isn't linked to a Monilog account yet. ` +
    `Add it as your phone number in the Monilog app (Settings → Profile), ` +
    `then message me again.\n\n` +
    `Once linked, you can log money like \`-5000 food\` and ask \`balance\`.`
  );
}
