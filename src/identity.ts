import { supabase } from "./supabase";

/** Normalize an inbound sender to E.164 (with a leading "+"). */
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/**
 * Map a WhatsApp sender's phone number to a Moniilog user id.
 * Looks up public.profiles where phone_number matches E.164.
 * Returns null if the number is not linked.
 */
export async function resolveUid(e164: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_number", e164)
      .maybeSingle();

    if (error) {
      console.error("resolveUid query failed:", error);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error("resolveUid exception:", error);
    return null;
  }
}

/**
 * Redeems a 6-digit WhatsApp linking code generated in the Moniilog app.
 */
export async function linkPhoneNumberWithCode(
  code: string,
  e164: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("redeem_phone_link_code", {
      p_code: code.trim(),
      p_phone_number: e164
    });

    if (error) {
      console.error("redeem_phone_link_code RPC failed:", error);
      return { success: false, message: "⚠️ Could not link account. Please try again." };
    }

    if (data?.status === "ok") {
      return {
        success: true,
        message: "✅ Success! Your WhatsApp number is now linked to your Moniilog account. You can now log transactions like `-5000 food` or send `balance`."
      };
    }

    if (data?.status === "expired") {
      return {
        success: false,
        message: "⚠️ That link code has expired. Please generate a fresh code in the Moniilog app (Settings → Link WhatsApp)."
      };
    }

    return {
      success: false,
      message: "⚠️ Invalid link code. Check the 6-digit code in the Moniilog app (Settings → Link WhatsApp)."
    };
  } catch (error) {
    console.error("linkPhoneNumberWithCode error:", error);
    return { success: false, message: "⚠️ Could not link account at this time." };
  }
}
