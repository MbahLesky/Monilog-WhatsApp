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

## WhatsApp Bot Task Registry & Roadmap

> [!IMPORTANT]
> **Workflow Protocol:** Tasks specific to the WhatsApp bot service are tracked here. When completed, tasks are struck through (`~~[x] ...~~`). Proposed tasks must be approved before implementation.

### Completed Bot Milestones
- ~~[x] **BOT-001:** Setup Node.js 20 + Express + TypeScript service architecture~~
- ~~[x] **BOT-002:** Implement provider-agnostic adapter architecture supporting Meta WhatsApp Cloud API and Twilio~~
- ~~[x] **BOT-003:** Connect bot directly to Supabase PostgreSQL database using service role client~~
- ~~[x] **BOT-004:** Integrate Gemini NLP model for intelligent transaction parsing from free-form text messages~~
- ~~[x] **BOT-005:** Implement instant phone auto-linking for senders matching `profiles.phone_number`~~
- ~~[x] **BOT-006:** Implement 6-digit code pairing (`LINK <code>`) for linking non-phone authenticated users~~
- ~~[x] **BOT-007:** Implement conversational balance and monthly spending summary query handlers~~

### Current / In-Progress Tasks
- [ ] **BOT-008: End-to-End WhatsApp-to-App Sync Test**: Verify transaction logged in WhatsApp chat immediately triggers realtime sync to Mobile and Web.
- [ ] **BOT-009: Automated Daily Evening Digest**: Configure scheduled cron script to send daily spending summary to opted-in WhatsApp users.

### Proposed Upcoming Tasks (Pending Approval)
- [ ] **BOT-010: 24/7 Cloud Deployment**: Dockerize and deploy bot container to Railway, Render, or VPS for uninterrupted uptime.
- [ ] **BOT-011: Multi-Currency Message Parsing**: Detect and parse multiple currency symbols/codes in incoming messages.

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
