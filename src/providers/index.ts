import { config } from "../config";
import { metaProvider } from "./meta";
import { twilioProvider } from "./twilio";
import type { WhatsAppProvider } from "./types";

export function selectProvider(): WhatsAppProvider {
  return config.provider === "meta" ? metaProvider : twilioProvider;
}

export type { WhatsAppProvider } from "./types";
