import { executeCommand } from "./commands";
import { linkPhoneNumberWithCode, resolveUid, toE164 } from "./identity";
import { getCurrency } from "./ledger";
import { parseMessage } from "./parser";

export interface InboundMessage {
  from: string;
  text: string;
}

/**
 * Turn one inbound WhatsApp message into a reply string.
 * Resolves the sender to a Moniilog account, parses the message, and runs the command.
 * Also handles the fallback `LINK <code>` command.
 */
export async function handleMessage(message: InboundMessage): Promise<string> {
  const e164 = toE164(message.from);

  try {
    // Check if the user is attempting to link their phone number via a 6-digit code
    const linkMatch = message.text.trim().match(/^link\s+(\d{6})$/i);
    if (linkMatch) {
      const result = await linkPhoneNumberWithCode(linkMatch[1], e164);
      return result.message;
    }

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
    `👋 Welcome to *Moniilog*!\n\n` +
    `This number (${e164}) is not connected to a Moniilog account yet.\n\n` +
    `*How to connect:*\n` +
    `1. Sign in with this phone number in the Moniilog app, or\n` +
    `2. In the Moniilog app, go to Settings → Link WhatsApp, and reply here with: *LINK <6-digit-code>*\n\n` +
    `Once linked, you can log expenses like \`-5000 food\` and check your \`balance\` anytime!`
  );
}
