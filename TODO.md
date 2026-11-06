# Moniilog WhatsApp Bot — Task Registry & Roadmap

> [!IMPORTANT]
> **Workflow Protocol:** Tasks specific to the WhatsApp bot service are tracked here. When completed, tasks are struck through (`~~[x] ...~~`). Proposed tasks must be approved by the project owner before implementation.

---

## 1. Completed Bot Milestones
- ~~[x] **BOT-001:** Setup Node.js 20 + Express + TypeScript service architecture~~
- ~~[x] **BOT-002:** Implement provider-agnostic adapter architecture supporting Meta WhatsApp Cloud API and Twilio~~
- ~~[x] **BOT-003:** Connect bot directly to Supabase PostgreSQL database using service role client~~
- ~~[x] **BOT-004:** Integrate Gemini NLP model for intelligent transaction parsing from free-form text messages~~
- ~~[x] **BOT-005:** Implement instant phone auto-linking for senders matching `profiles.phone_number`~~
- ~~[x] **BOT-006:** Implement 6-digit code pairing (`LINK <code>`) for linking non-phone authenticated users~~
- ~~[x] **BOT-007:** Implement conversational balance and monthly spending summary query handlers~~
- ~~[x] **BOT-008:** Multi-Line Transaction Parsing & Interactive Confirmation: Parse 1 or more lines in a single WhatsApp message into individual transactions, calculate additions/totals, present a review prompt, and require user confirmation (Yes/No) before saving to the database~~

---

## 2. Current / In-Progress Tasks
- [ ] **BOT-009: End-to-End WhatsApp-to-App Sync Test**: Verify transaction logged in WhatsApp chat immediately triggers realtime sync to Mobile and Web.
- [ ] **BOT-010: Automated Daily Evening Digest**: Configure scheduled cron script to send daily spending summary to opted-in WhatsApp users.

---

## 3. Proposed Upcoming Tasks (Pending Approval)
- [ ] **BOT-011: 24/7 Cloud Deployment**: Dockerize and deploy bot container to Railway, Render, or VPS for uninterrupted uptime.
- [ ] **BOT-012: Multi-Currency Message Parsing**: Detect and parse multiple currency symbols/codes in incoming messages.
