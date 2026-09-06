# Monilog v2 — WhatsApp Bot Migration Notes

The full cross-repo plan lives in the mobile repository:
`Monilog/docs/v2_architecture_plan.md`. This file records only what changes in
this repository.

## What v2 changes for the bot

The ledger moves from Firestore to Supabase Postgres, which is what finally makes
a WhatsApp-logged transaction reach the phone as well as the web app.

- **`firebase-admin` → `supabase-js` with the service-role key.** `firebase.ts`,
  `identity.ts` and `ledger.ts` are rewritten against Postgres. The bot has no
  local store and needs none — it is a server-side process on a reliable network.
- **Identity by profile, not Firebase Auth.** `resolveUid` becomes a lookup of
  `profiles.phone_number` (E.164) → `user_id`. The `phone_links/{e164}` fallback
  collection goes away.
- **Linking flow.** The app shows a short-lived code from `phone_link_codes`; the
  user sends `LINK <code>` to the bot; the bot verifies it and sets
  `profiles.phone_number` and `phone_verified_at`. No SMS OTP cost, and it proves
  control of the WhatsApp number.
- **Every write sets `updated_at`** so bot rows take part in the same
  last-write-wins ordering as device rows.

## Security note

The service-role key bypasses RLS, so the bot is the one component that can reach
any user's data. Every query must filter by the resolved `user_id`, and that
filter belongs in a single data-access module — no ad-hoc queries elsewhere in
the codebase.
