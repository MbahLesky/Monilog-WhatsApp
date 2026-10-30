import "dotenv/config";

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function boolean(name: string, fallback = false): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export type ProviderName = "twilio" | "meta";

// Meta's Cloud API is the default: it has no platform fee, and replies to
// user-initiated messages fall inside WhatsApp's free 24h service window — which
// is every message this bot sends. Twilio is kept as an optional adapter.
function providerName(): ProviderName {
  const value = (optional("WHATSAPP_PROVIDER") ?? "meta").toLowerCase();
  if (value !== "twilio" && value !== "meta") {
    throw new Error(`WHATSAPP_PROVIDER must be "twilio" or "meta", got "${value}".`);
  }
  return value;
}

export const config = {
  port: Number(optional("PORT") ?? 3001),
  publicUrl: optional("PUBLIC_URL"),
  skipSignatureCheck: boolean("SKIP_SIGNATURE_CHECK", false),
  provider: providerName(),
  defaultCurrency: optional("DEFAULT_CURRENCY") ?? "XAF",
  supabase: {
    url: optional("SUPABASE_URL") ?? "",
    serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  },
  twilio: {
    authToken: optional("TWILIO_AUTH_TOKEN"),
    from: optional("TWILIO_WHATSAPP_FROM")
  },
  meta: {
    verifyToken: optional("META_VERIFY_TOKEN"),
    appSecret: optional("META_APP_SECRET"),
    accessToken: optional("META_ACCESS_TOKEN"),
    phoneNumberId: optional("META_PHONE_NUMBER_ID")
  }
} as const;

export type AppConfig = typeof config;
