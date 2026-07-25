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

const GRAPH_API_VERSION = "v21.0";

function headerValue(headers: SignatureInput["headers"], name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

interface MetaWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Meta WhatsApp Cloud API adapter. GET requests are verify challenges; POST
 * webhooks carry JSON, authenticated with X-Hub-Signature-256 (HMAC-SHA256 over
 * the raw body). Replies are sent out-of-band via the Graph API.
 */
export const metaProvider: WhatsAppProvider = {
  name: "meta",

  handleVerification(query: Record<string, unknown>): string | null {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token === config.meta.verifyToken && typeof challenge === "string") {
      return challenge;
    }
    return null;
  },

  verifySignature({ rawBody, headers }: SignatureInput): boolean {
    const appSecret = config.meta.appSecret;
    if (!appSecret) {
      console.error("META_APP_SECRET is not set; cannot verify signatures.");
      return false;
    }

    const header = headerValue(headers, "x-hub-signature-256");
    if (!header.startsWith("sha256=")) return false;
    const provided = header.slice("sha256=".length);

    const expected = createHmac("sha256", appSecret).update(Buffer.from(rawBody, "utf8")).digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  },

  parseInbound({ body }: ParseInput): InboundMessage[] {
    const payload = (body ?? {}) as MetaWebhookBody;
    const messages: InboundMessage[] = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (message.type !== "text") continue;
          const from = (message.from ?? "").trim();
          const text = (message.text?.body ?? "").trim();
          if (from && text) messages.push({ from, text });
        }
      }
    }

    return messages;
  },

  async sendReplies(replies: OutboundReply[], res: Response): Promise<void> {
    const { accessToken, phoneNumberId } = config.meta;
    if (!accessToken || !phoneNumberId) {
      console.error("META_ACCESS_TOKEN / META_PHONE_NUMBER_ID not set; cannot send replies.");
      res.sendStatus(200);
      return;
    }

    const endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    for (const reply of replies) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: reply.to,
            type: "text",
            text: { body: reply.text }
          })
        });
        if (!response.ok) {
          console.error(`Meta send failed (${response.status}): ${await response.text()}`);
        }
      } catch (error) {
        console.error("Meta send request threw", error);
      }
    }

    res.sendStatus(200);
  }
};
