# Moniilog — WhatsApp Bot

A WhatsApp chatbot for **Moniilog** that lets users **log, query, and edit** transactions by chat. It reads and writes directly into the unified Supabase PostgreSQL database, so transactions logged on WhatsApp sync immediately to the mobile and web apps.

```
WhatsApp ──▶ provider (Meta / Twilio) ──▶ this bot service ──▶ Supabase PostgreSQL
                                                                     │
                                                 mobile (Drift) + web (Dexie) ◀┘ (outbox sync)
```

- **Stack:** Node 20 + Express + TypeScript, Supabase JS Client (`@supabase/supabase-js`), Gemini AI API.
- **Provider-agnostic:** ships with **Meta WhatsApp Cloud API** (default) and a **Twilio** adapter; switch with one env var.
- **Intelligent NLU:** Gemini model parsing for natural transaction extraction.
- **Instant Phone Auto-Linking:** Senders whose phone number matches an authenticated account in `public.profiles (phone_number)` are recognized immediately.
- **Fallback Code Linking:** Unlinked users can connect their number by messaging `LINK <6-digit-code>` generated in the app.

---

## Task Registry & Roadmap

All active, completed, and proposed roadmap tasks for the WhatsApp bot are managed in [**TODO.md**](./TODO.md).

---

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and Meta credentials.

3. Start server:
   ```bash
   npm run dev
   ```

4. Tunnel webhook:
   ```bash
   npm run tunnel
   ```
