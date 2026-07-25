import type { Response } from "express";
import type { ProviderName } from "../config";
import type { InboundMessage } from "../handler";

export interface SignatureInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  /** The full public URL the request hit (needed for Twilio's scheme). */
  url: string;
  /** Parsed form/body params (Twilio signs over these). */
  params: Record<string, string>;
}

export interface ParseInput {
  rawBody: string;
  /** Parsed request body (form for Twilio, JSON for Meta). */
  body: unknown;
}

export interface OutboundReply {
  to: string;
  text: string;
}

export interface WhatsAppProvider {
  readonly name: ProviderName;

  /**
   * Handle a GET webhook verification challenge. Returns the challenge string to
   * echo back when valid, or null when the request isn't a valid verification
   * (Twilio never uses this and always returns null).
   */
  handleVerification(query: Record<string, unknown>): string | null;

  /** Verify the inbound request signature against the shared secret. */
  verifySignature(input: SignatureInput): boolean;

  /** Extract inbound text messages from a POST webhook (empty = ignore). */
  parseInbound(input: ParseInput): InboundMessage[];

  /**
   * Deliver replies for the current inbound request and finish the HTTP response.
   * Twilio writes TwiML into `res`; Meta calls the Graph API then returns 200.
   */
  sendReplies(replies: OutboundReply[], res: Response): Promise<void>;
}
