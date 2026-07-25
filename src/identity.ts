import { adminAuth, adminDb } from "./firebase";

/** Normalize an inbound sender to E.164 (with a leading "+"). */
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/**
 * Map a WhatsApp-verified phone number to a Monilog (Firebase) user id.
 *
 * 1. Firebase Auth is the primary source — a user who added their phone to their
 *    account is matched automatically.
 * 2. A `phone_links/{e164}` document ({ uid }) is a fallback so a number can be
 *    linked even before phone auth is enabled in the apps.
 *
 * Returns null when the number is not linked to any account.
 */
export async function resolveUid(e164: string): Promise<string | null> {
  try {
    const user = await adminAuth.getUserByPhoneNumber(e164);
    return user.uid;
  } catch (error) {
    // auth/user-not-found is expected for unlinked numbers; anything else is a
    // real failure worth surfacing in logs but still falling through to the map.
    if (!isUserNotFound(error)) {
      console.error("getUserByPhoneNumber failed", error);
    }
  }

  const snap = await adminDb.collection("phone_links").doc(e164).get();
  const data = snap.data() as { uid?: string } | undefined;
  return data?.uid ?? null;
}

function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "auth/user-not-found"
  );
}
