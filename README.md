# Eventa: AI event planning platform for Nigeria (MVP)

Eventa plans Nigerian weddings end to end. The core is event-agnostic, so birthdays, burials and corporate events can be added later as new "event packs".

"Eventa" is a placeholder brand. Rename it in `src/lib/config.ts`.

## What's in this MVP

| Module | What it does | Key files |
| --- | --- | --- |
| 1. AI planner & budget | Intake form, then Claude builds a costed plan in 3 tiers (Essential, Comfortable, Premium). It proposes a budget if none is given, lists honest warnings and a countdown checklist. You can edit or lock budget lines, switch tiers, and ask the planning assistant, which can suggest budget changes you apply in one click. A budget tracker shows planned vs committed vs paid. | `src/lib/ai/*`, `src/lib/packs/wedding.ts`, `src/app/events/[id]/plan` |
| 2. Vendor marketplace | Vendor accounts, packages, KYC submission (BVN/NIN, CAC, bank), tiers (Listed, Verified, Verified Pro), and transparent match scoring by price fit, rating, verification, style and availability. Booking chat masks phone numbers until escrow is funded. Only escrow-verified clients can leave reviews. | `src/lib/matching.ts`, `src/app/vendors`, `src/app/vendor` |
| 3. Escrow payments | Milestones of 30% deposit, 50% pre-event and 20% on delivery. Payment goes through a provider abstraction (mock or Paystack) and every money movement is a double-entry ledger record. The deposit can be released early. A 72-hour auto-release starts after delivery. Disputes freeze one milestone and admins resolve them with a percentage split. Commission and client protection fee are configurable. | `src/lib/escrow.ts`, `src/lib/payments/provider.ts`, `src/app/api/payments/*` |
| 4. Contracts | Each accepted quote generates a contract from the pack's clause library plus any chat messages pinned to it. Both parties sign with an OTP. Signatures bind to the SHA-256 hash of the text, and the contract has a printable PDF view. | `src/lib/contracts.ts`, `src/app/contracts/[id]` |
| 5. Guest access & seating | Guest list with bulk paste import, RSVP links that can be sent on WhatsApp, and a personal QR access card per guest that can be revoked or re-issued. Hosts set up tables by zone, and auto-seating keeps groups together and fills VIP and family zones first. The offline-first gate scanner uses the camera or a USB scanner and syncs check-ins when back online. | `src/lib/guests.ts`, `src/components/GateScanner.tsx`, `src/app/events/[id]/{guests,seating,gate}` |
| Admin | Verification queue, Pro eligibility, dispute resolution, ledger balances and auto-release. | `src/app/admin` |

## Run it locally

Requirements: Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL and AUTH_SECRET
npm run db:push               # create tables
npm run db:seed               # demo users + 32 fictional vendors in Lagos and Abuja
npm run dev                   # http://localhost:3000
```

Demo logins (password `password123`):

- `client@eventa.ng`: a couple planning a wedding
- `vendor@eventa.ng`: Mama Tee Kitchens (caterer, Verified Pro)
- `admin@eventa.ng`: trust & safety / finance
- `gate@eventa.ng`: ushers at the gate

### Turn on the AI planner

Set `ANTHROPIC_API_KEY` in `.env` (get one at console.anthropic.com). The model defaults to `claude-sonnet-5-5`. You can change it with `ANTHROPIC_MODEL`. Without a key, the app still works using template estimates and clearly says so on screen.

### Real payments (Paystack)

1. Set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY` (start with the test key).
2. In the Paystack dashboard, set the webhook URL to `https://YOUR_DOMAIN/api/payments/webhook`.
3. Vendor payouts use Paystack transfers to a recipient code stored in `vendors.payout_recipient`. Creating recipients during KYC is still a TODO (see below). Until then, payouts are recorded as "queued".

> Legal note: the platform should not hold customer funds itself. Before going live, get a Nigerian fintech lawyer to confirm the escrow structure (a licensed PSP plus a bank or trustee escrow account) and any CBN approvals needed.

### Auto-release cron

`GET /api/cron/auto-release` with the header `Authorization: Bearer $CRON_SECRET` releases milestones whose 72-hour window has passed. `vercel.json` schedules it every 15 minutes on Vercel. Elsewhere, use any cron service.

## Deploy

- **Vercel + Neon/Supabase Postgres:** import the repo, set the env vars, then run `npm run db:push` once against the production DB.
- **Any Node host (Render, Railway, a VPS):** `npm run build && npm start`.

## Project structure

```
src/
  app/                 Next.js App Router pages, server actions (app/actions) and API routes
  components/          UI pieces (Nav, AccessCard, GateScanner, badges)
  db/schema.ts         Drizzle schema: users, vendors, events, plans, bookings, contracts,
                       milestones, ledger, disputes, reviews, tables, guests
  db/seed.ts           Demo data
  lib/
    ai/                Claude client, planner (structured output), assistant (tool use)
    packs/             Event packs. Add new event types here.
    payments/          Payment provider abstraction (mock, Paystack)
    escrow.ts          Funding, release, auto-release, disputes, ledger
    contracts.ts       Contract builder + OTP
    guests.ts          Tokens, QR, auto-seating, CSV parsing
    matching.ts        Vendor ranking
```

## What's not done yet (next steps)

- **SMS/WhatsApp delivery:** OTPs and notifications are logged, not sent. Wire up Termii or the WhatsApp Business API in `sendOtp()` and add notification hooks. `SHOW_DEV_OTP=1` shows codes on screen for testing and must be off in production.
- **Real KYC:** BVN/NIN verification, bank account resolution and Paystack transfer recipients through a provider such as Dojah, Smile ID or Paystack. Today an admin approves vendors manually.
- **Photo uploads:** vendor portfolios and delivery evidence need object storage (S3/R2).
- **Co-planner access** so family members can view, approve and pay.
- **Rate limiting, audit logs, email verification and password reset.**
- **NDPA compliance:** privacy notice, consent records, NDPC registration and DPO.
- Automated tests in CI. The repo was verified with end-to-end browser runs, which aren't checked in yet.
