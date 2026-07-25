import { createHmac, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { config } from "../config";
import type { InboundMessage } from "../handler";
import type {
  OutboundReply,
  ParseInput,
  SignatureInput,
  WhatsAppProvider
} from "./types";

function headerValue(headers: SignatureInput["headers"], name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Twilio WhatsApp adapter. Inbound webhooks arrive as x-www-form-urlencoded with
 * `From`/`Body`; replies are returned inline as TwiML (no outbound credentials
 * needed). Requests are authenticated with the X-Twilio-Signature HMAC-SHA1.
 */
export const twilioProvider: WhatsAppProvider = {
  name: "twilio",

  handleVerification() {
    return null;
  },

  verifySignature({ headers, url, params }: SignatureInput): boolean {
    const authToken = config.twilio.authToken;
    if (!authToken) {
      console.error("TWILIO_AUTH_TOKEN is not set; cannot verify signatures.");
      return false;
    }

    const signature = headerValue(headers, "x-twilio-signature");
    if (!signature) return false;

    // Twilio's scheme: full URL + each POST param (sorted by key) as key+value.
    const sortedKeys = Object.keys(params).sort();
    const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
    const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");

    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, signatureBuffer);
  },

  parseInbound({ body }: ParseInput): InboundMessage[] {
    const form = (body ?? {}) as Record<string, string>;
    const from = (form.From ?? "").replace(/^whatsapp:/i, "").trim();
    const text = (form.Body ?? "").trim();
    if (!from || !text) return [];
    return [{ from, text }];
  },

  async sendReplies(replies: OutboundReply[], res: Response): Promise<void> {
    const messages = replies.map((reply) => `<Message>${escapeXml(reply.text)}</Message>`).join("");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${messages}</Response>`;
    res.set("Content-Type", "text/xml").status(200).send(twiml);
  }
};
