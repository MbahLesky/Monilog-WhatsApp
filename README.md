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

## Running it day-to-day

> First time? Do the one-off **[Setup](#setup)** below first (Firebase key, Meta
> app, `phone_links`). After that, this is the routine every time you want the
> bot live locally. You need **two terminals**, both kept open.

**Terminal 1 — the bot**

```powershell
cd "C:\Users\mbahl\Documents\Projects\Monilog\Monilog - WhatsApp"
npm run dev
```
Wait for `Monilog WhatsApp bot listening on :3001 (provider=meta, signatureCheck=true)`.

**Terminal 2 — the public tunnel**

```powershell
cd "C:\Users\mbahl\Documents\Projects\Monilog\Monilog - WhatsApp"
npm run tunnel
```
If `cloudflared` isn't found, open a **new** terminal (so PATH refreshes) or use the
full path: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3001`.

It prints a line like `https://<random-words>.trycloudflare.com`. Copy it.

**Point Meta at the new URL** — [Meta for Developers](https://developers.facebook.com/apps)
→ your app → **WhatsApp → Configuration → Webhook → Edit**:

- **Callback URL:** `https://<random-words>.trycloudflare.com/webhook/whatsapp` (don't forget `/webhook/whatsapp`)
- **Verify token:** the value already in your `.env` (`META_VERIFY_TOKEN`) — unchanged
- **Verify and save.** `messages` stays subscribed from the first time.

> ⚠️ **The free tunnel URL is different on every `npm run tunnel`**, so you must
> update the Callback URL each session. To stop re-pasting it, either run a
> permanent [Cloudflare **named tunnel**](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
> (stable hostname) or [deploy](#deploy) to a host with a fixed URL.

**Test:** from your linked phone, message the test number (e.g. `-5000 food`). To
stop: `Ctrl+C` in both terminals.

Health check anytime: open `https://<your-url>/health` → `{"status":"ok","provider":"meta"}`.

### Heads-up: the access token expires

The Meta **test** token (`META_ACCESS_TOKEN`) lasts ~24h. If the bot suddenly
can't send replies, regenerate it under **WhatsApp → API Setup** and update `.env`
(the bot re-reads it on restart). For anything lasting, switch to a permanent
**System User** token — see [Setup](#2-meta-whatsapp-cloud-api-default).

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
4. Expose this service publicly with a tunnel (`npm run tunnel`, using
   [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/);
   install once with `winget install Cloudflare.cloudflared`), then under
   **WhatsApp → Configuration** set:
   - **Callback URL:** `https://<your-tunnel-url>/webhook/whatsapp`
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
| `npm run tunnel` | Expose `:3001` publicly via a Cloudflare quick tunnel |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run parser tests (vitest) |
| `npm run smoke` | End-to-end test against real Firestore (isolated test user, auto-cleanup) |

## Deploy permanently (Railway)

Hosting the bot on Railway gives it a **stable URL** and keeps it running without
your laptop — so you set the Meta Callback URL **once** and testers can use it
anytime. The Express server runs unchanged; Railway injects `PORT` and the app
already honors it.

### One prerequisite: a permanent access token

The Meta **test** token expires every ~24h — useless for an always-on bot. Before
deploying, mint a non-expiring **System User** token:

1. [business.facebook.com/settings](https://business.facebook.com/settings) →
   **Users → System Users** → add one (role: Admin) if you don't have it.
2. **Add Assets** → assign your WhatsApp app with full control.
3. **Generate new token** → pick the app → scopes **`whatsapp_business_messaging`**
   and **`whatsapp_business_management`** → set expiry **Never** → generate and copy.

Use this value for `META_ACCESS_TOKEN` on Railway (not the 24h test token).

### Deploy from this folder (Railway CLI)

No GitHub repo needed — the CLI uploads this directory (`.railwayignore` keeps
`node_modules`/`.env` out).

```powershell
npm i -g @railway/cli
railway login                 # opens the browser
cd "C:\Users\mbahl\Documents\Projects\Monilog\Monilog - WhatsApp"
railway init                  # create a new project (give it a name)
railway up                    # build + deploy
railway domain                # generate the public URL, e.g. https://monilog-whatsapp-production.up.railway.app
```

### Set the environment variables

In the Railway project → **Variables** (the **Raw Editor** lets you paste them all
at once). Add everything from your `.env` **except `PORT`** — Railway sets `PORT`
itself, and hard-coding it breaks routing.

```
WHATSAPP_PROVIDER=meta
DEFAULT_CURRENCY=XAF
SKIP_SIGNATURE_CHECK=false
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
META_VERIFY_TOKEN=...
META_APP_SECRET=...
META_ACCESS_TOKEN=<the permanent System User token>
META_PHONE_NUMBER_ID=...
```

`FIREBASE_PRIVATE_KEY` stays a single line with literal `\n` (the app converts
them). Redeploy after changing variables: `railway up` (or it redeploys on save).

### Point Meta at the Railway URL — once

In **WhatsApp → Configuration → Webhook**, set the Callback URL to
`https://<your-app>.up.railway.app/webhook/whatsapp` (verify token unchanged) →
**Verify and save**. Because this URL is now stable, you never touch it again.
Confirm with `https://<your-app>.up.railway.app/health`.

> For a public launch (beyond the 5-recipient test number): register your own
> business phone number under **WhatsApp → API Setup** and complete Meta Business
> Verification. The bot code doesn't change — only `META_PHONE_NUMBER_ID`.

### Other hosts

Any Node host works (Fly, Render, a VPS). Set the same variables, point the
webhook at `https://<host>/webhook/whatsapp`, and use `GET /health` as the probe.
On a platform that doesn't inject `PORT`, set it yourself.
