# Monilog — WhatsApp Bot

A WhatsApp chatbot for [Monilog](../) that lets users **log, query, and edit**
transactions by chat. It writes into the same Firestore ledger the web and Flutter
apps sync against, so a message sent on WhatsApp shows up in the app automatically.

```
WhatsApp ──▶ provider (Meta / Twilio) ──▶ this service ──▶ Firestore
                                                              │
                                          web + Flutter apps ◀┘  (sync engine)
```

- **Stack:** Node 20 + Express + TypeScript, Firebase Admin SDK.
- **Provider-agnostic:** ships with **Meta WhatsApp Cloud API** (default) and a
  **Twilio** adapter; switch with one env var.
- **Rule-based parser** — deterministic, zero external NLU dependency.

### Why Meta, and why it's free

Meta charges **no platform fee** for the Cloud API, and **user-initiated service
conversations are free**: when someone messages you, you get a 24-hour window to
reply at no cost. This bot only ever *replies* to a user's message, so it stays
inside that free window essentially always.

Twilio resells the same Meta API with a per-message markup on top, so it is
strictly more expensive here. The adapter is kept only as an alternative.

> Meta's pricing changes periodically — worth a sanity check against the current
> [WhatsApp pricing page](https://business.whatsapp.com/products/platform-pricing)
> before launch.

## Message grammar

**Log**
| Example | Result |
| --- | --- |
| `-5000 food` | expense, 5 000, Food |
| `+50000 salary` | income, 50 000, Salary |
| `2000 taxi yesterday cash` | expense, Transport, dated yesterday, Cash account |
| `spent 3k on lunch` | expense, 3 000, Food |

- Amounts: `5k` = 5 000, `2.5k` = 2 500, `1m` = 1 000 000. A trailing `f`/`fcfa` is ignored.
- Type: leading `-`/`+`, or a verb (`spent`, `paid`, `received`), or the category's own type; defaults to expense.
- Date (optional): `today`, `yesterday`/`hier`, weekday names, `12/07`, `12/07/2026`.
- Account (optional): `cash`, `bank`, `momo`/`mtn`/`orange`, or a word matching one of your account names.
- Categories match EN/FR aliases and your own custom categories.

**Ask** — `balance` · `spent food this month` · `summary` · `last 5`
**Fix** — `undo` (remove last) · `edit amount 6000` · `edit category transport` · `edit note team lunch`
**Anytime** — `help`

## Setup

```bash
npm install
cp .env.example .env      # fill it in (see below)
npm run dev               # starts on :3001 with hot reload
```

### 1. Firebase (required)

Use the **same** service account/project as the web + Flutter apps (`monilog-28535`).
In the Firebase console → Project settings → Service accounts → *Generate new
private key*, then set in `.env`:

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

(Or leave those blank and set `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`.)

### 2. Meta WhatsApp Cloud API (default)

You can develop against this **without any business verification** — a new app
comes with a free test number that can message up to 5 recipients.

1. [Meta for Developers](https://developers.facebook.com/apps) → **Create app** →
   type **Business** → add the **WhatsApp** product.
2. Under **WhatsApp → API Setup** you get a free **test number**, its **Phone
   number ID**, and a 24-hour access token. Add your own number under
   *"To"* as a recipient so it can receive messages.
3. Find the **App secret** under **App settings → Basic**.
4. Expose this service publicly (e.g. `ngrok http 3001`), then under
   **WhatsApp → Configuration** set:
   - **Callback URL:** `https://<your-url>/webhook/whatsapp`
   - **Verify token:** any string you invent (put the same value in `.env`)
   - Click **Verify and save**, then **subscribe to the `messages` field**.
5. In `.env`:
   ```
   WHATSAPP_PROVIDER=meta
   META_VERIFY_TOKEN=<the verify token you chose>
   META_APP_SECRET=<app secret>
   META_ACCESS_TOKEN=<test token, or a permanent one for production>
   META_PHONE_NUMBER_ID=<phone number id>
   ```
6. Text the test number `-5000 food`.

Meta sends a `GET /webhook/whatsapp` to verify the URL; inbound messages then
arrive as POSTs. For production, swap the 24h token for a permanent **System
User** token and register your own business number.

> Tip: while wiring things up you can set `SKIP_SIGNATURE_CHECK=true` to bypass
> signature verification locally. Never do this in production.

### Optional: Twilio instead

Only worth it if you already run on Twilio — it costs more (see above). The
sandbox is quick to test with, and the flow (parse → Firestore → reply) is
identical, so switching is env-vars-only, no code changes.

1. Twilio Console → Messaging → *Try it out* → **WhatsApp sandbox**. Join the
   sandbox from your phone (send the join code to the sandbox number).
2. Set the sandbox **"When a message comes in"** webhook to
   `https://<your-url>/webhook/whatsapp` (HTTP POST).
3. In `.env`:
   ```
   WHATSAPP_PROVIDER=twilio
   TWILIO_AUTH_TOKEN=<from Twilio console>
   TWILIO_WHATSAPP_FROM=+14155238886   # the sandbox number
   PUBLIC_URL=https://<your-url>        # exact base URL, needed for signature checks
   ```
   (Replies go back inline as TwiML — no outbound credentials needed.)

## Linking a phone number to an account

The bot maps the sender's WhatsApp-verified number to a Monilog user via:

1. **Firebase Auth** — `getUserByPhoneNumber`. If a user has their phone on their
   Firebase account, they're matched automatically.
2. **`phone_links/{e164}` fallback** — a Firestore doc `{ uid }` so a number can be
   linked before phone auth exists in the apps. Create one manually to link a tester:
   ```
   phone_links / +237650000000  →  { uid: "<firebase-uid>" }
   ```

Unlinked senders get a friendly message explaining how to link.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with hot reload (tsx) |
| `npm start` | Run the service (tsx) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run parser tests (vitest) |

## Deploy

Any Node host works (Railway, Render, Fly, a VPS, or Vercel). Set the same env
vars, point the provider webhook at `https://<host>/webhook/whatsapp`, and set
`PUBLIC_URL` to the deployed origin. `GET /health` returns a JSON status probe.
