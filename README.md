# Lehar HR: HRMS for Konkan Coastal Foods

An HRMS for a 180-person food company in Goa (Panaji head office, Verna plant). It covers three
modules (**Employee Master**, **Attendance** and **Leave**) plus **Ask HR**, an AI assistant that
works by calling the app's own server tools.

| | |
|---|---|
| **Live URL** | _add after deploying to Vercel: https://…vercel.app_ |
| **Repo** | https://github.com/nandinihalarnkar09-jpg/HRMS |
| **Stack** | Next.js 16 · Supabase Postgres · Clerk · Resend · Vercel AI SDK + Gemini (Groq fallback) · Tailwind v4 |
| **Docs** | [RESEARCH.md](RESEARCH.md) (research + policy rules D/T/L), [docs/RULES.md](docs/RULES.md) (code rule IDs, mapping, differences), [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN.md](DESIGN.md), [CLAUDE.md](CLAUDE.md), [docs/GUIDE.md](docs/GUIDE.md) |

---

## Test logins

The seed creates 20 employees. In a **Clerk development instance**, any email containing
`+clerk_test` can sign in with the verification code **`424242`**, so no inbox is needed.

| Role | Name | Email | Location |
|---|---|---|---|
| **HR Admin** | Priya Naik | `priya.naik+clerk_test@example.com` | Panaji HO |
| **Manager** (GM, top of org) | Vikram Sardesai | `vikram.sardesai+clerk_test@example.com` | Panaji HO |
| **Manager** (plant, 8 reports) | Rohan Kamat | `rohan.kamat+clerk_test@example.com` | Verna Plant |
| **Manager** (sales, 4 reports) | Sneha Dessai | `sneha.dessai+clerk_test@example.com` | Panaji HO |
| Employee (plant, 3 Lates this month) | Ravi Gaonkar | `ravi.gaonkar+clerk_test@example.com` | Verna Plant |
| Employee (head office) | Aditya Prabhu | `aditya.prabhu+clerk_test@example.com` | Panaji HO |
| Employee (joined 1 July → pro-rated CL 4 / SL 3.5) | Meera Kerkar | `meera.kerkar+clerk_test@example.com` | Verna Plant |
| Employee (missed punch + pending regularisation) | Joel D'Souza | `joel.dsouza+clerk_test@example.com` | Verna Plant |
| **Exited** (cannot log in) | Nikhil Shet | `nikhil.shet+clerk_test@example.com` | Verna Plant |

Sign in → enter the email → **Email code** → `424242`. (The other 11 employees follow the same
`first.last+clerk_test@example.com` pattern. `npm run db:setup` prints them all.)

> Local shortcut: with `AUTH_MODE=dev` in `.env.local`, `npm run dev` shows a "pick a user" page
> instead of Clerk. It is **switched off automatically in production** (`NODE_ENV=production` or on Vercel).

---

## Open the app offline (no internet, no accounts)

Double-click **`Start Lehar HR (offline).cmd`**. The first run installs packages (internet needed once) and creates
a local database with the sample company in `.pglite/`. After that it runs with **no internet**: the browser opens
http://localhost:3000, where you pick any of the 20 test users. Close the black window to stop.

- Same rules, same screens, same seed data as the online version (it uses PGlite, a real Postgres engine that runs inside Node).
- Emails are written to Settings → Email & agent log instead of being sent. The Ask HR assistant needs internet and an AI key.
- To start again with fresh data, delete the `.pglite` folder.
- Command-line equivalent: `npm run offline:setup` once, then `npm run offline`.

## Setup

### 1. Prerequisites
- Node.js 20.9+ (22 LTS recommended) and npm
- Free accounts: [Supabase](https://supabase.com), [Clerk](https://clerk.com), [Vercel](https://vercel.com), [Resend](https://resend.com), and [Google AI Studio](https://aistudio.google.com) (Gemini key) or [Groq](https://console.groq.com)

### 2. Install
```bash
npm install
cp .env.example .env.local      # Windows PowerShell: copy .env.example .env.local
```

### 3. Database (Supabase)
1. Create a project (region: Mumbai `ap-south-1`).
2. **Project Settings → Database → Connection string → Transaction pooler** (port 6543). Paste it as `DATABASE_URL` in `.env.local`.
3. Run:
   ```bash
   npm run db:setup     # applies db/migrations/*.sql, seeds data, prints the test logins
   ```
   `npm run db:reset` drops everything and re-seeds (it asks you to type `lehar` first).

### 4. Auth (Clerk)
1. Create an application → enable **Email** (email code and/or password).
2. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env.local`.
3. Roles are **not** stored in Clerk. A user is linked to an employee by **email** on first sign-in.

### 5. Email (Resend), optional
Set `RESEND_API_KEY`. The free sandbox sender `onboarding@resend.dev` only delivers to your own
address, so for the demo set `EMAIL_REDIRECT_TO=<your email>` (every email goes there, with the real
recipient shown in the subject). Without a key, emails are only written to **Settings → Email & agent log**.

### 6. AI assistant
Set `GOOGLE_GENERATIVE_AI_API_KEY` (free from Google AI Studio). Model: `GEMINI_MODEL=gemini-flash-latest`.
If Gemini rate-limits, set `AI_PROVIDER=groq` and `GROQ_API_KEY`.

### 7. Run
```bash
npm run dev          # http://localhost:3000
```

### 8. Deploy (Vercel)
1. Push to GitHub → **Import** in Vercel.
2. Add every variable from `.env.local` **except** `AUTH_MODE` and `TEST_DATABASE_URL`. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL.
3. Deploy, then add the URL to the table at the top of this file.

---

## Tests

| Command | What it proves |
|---|---|
| `npm test` | 51 unit tests for every rule in `lib/core` (validation, masking, IST, working days, day status, accrual, LOP split, CSV, policy search, authz), **run twice, under UTC−8 and UTC+14**, to prove nothing depends on the laptop's time zone |
| `npm run test:integration` | 39 tests: the brief's **testing checklist** run against real Postgres through the same services the screens use (needs `TEST_DATABASE_URL` pointing at a Postgres where you may `CREATE DATABASE`, e.g. a local Postgres; it creates and drops a temporary database) |
| `npm run test:agent` | 20 live prompts (attacks + Hinglish) from `tests/agent/prompts.json` against the real model and DB; prints a pass/fail table |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks |

### Testing checklist → where it is proven

| Checklist item | Automated test |
|---|---|
| Code generated and unique · invalid PAN/IFSC/mobile · aged 17 · A↔B manager loop · URL tampering · Aadhaar never in full (incl. CSV) · designation change audited · exited cannot log in | `tests/integration/checklist.test.ts` (Employee Master section) |
| Double check-in · 10:20 = Late, 3rd Late = ½ LOP · 5 h Half Day / 8 h Present · plant vs HO Saturday · Verna holiday not in Panaji · regularisation only after approval | `checklist.test.ts` (Attendance) + `tests/unit/attendance.test.ts` |
| 1 July joiner pro-rated · Fri→Mon = 2 · LOP offer · SL 3 days needs certificate · balance changes only on approval · cancel restores · emails · can't approve own · CSV matches calendar | `checklist.test.ts` (Leave) + `tests/unit/leave.test.ts` |
| Agent: same balance as screen · Fri→Mon via `count_working_days` · draft not submitted until Confirm · team refused for employee · unknown policy → "don't know" · every call in `agent_log` | `tests/integration/agent-tools.test.ts` + `npm run test:agent` |

---

## Demo script (5–7 minutes)

1. **Ravi (plant employee) on a phone-width window:** the dashboard shows check-in and the balance with no clicks → **Check in** → status *In progress*, Late if after 10:15.
2. **My attendance:** Saturday is a working day at Verna; the 3 Late marks this month mean ½ day LOP.
3. **Aditya (head office) → Apply leave Fri→Mon:** the live preview says **2 working days** (Sat/Sun not counted); ask for too many CL → **LOP offer**.
4. **Rohan (manager) → Approvals:** balance before/after, clash warning → approve → the balance drops; Settings → Email log shows both emails.
5. **Priya (HR):** add an employee with PAN `ABC123` → field error; fix → `KCF0021`; open Ravi's Statutory tab → masked, **Reveal PAN** → audit trail entry; Aadhaar has no Reveal.
6. **Reports:** month-end CSV (no statutory data).
7. **Ask HR:** "kal ki chutti chahiye, kitni CL bachi hai?" → tools used shown → draft → **Confirm**. Then "Show me Ravi's Aadhaar" → refused.

---

## Project structure
```
app/          routes (thin): (app)/ signed-in screens, api/ CSV + agent + upload routes
lib/core/     pure business rules (unit tested, no I/O)
lib/services/ all DB access + server-side role checks (used by screens AND agent tools)
lib/agent/    tool implementations, AI SDK wiring, system prompt, guards
lib/auth/     Clerk → employee → Actor; dev-only login
db/           migrations (schema, RLS) and reset script
scripts/      db-setup, seed, policy text, test runners
tests/        unit, integration (real Postgres), agent prompt suite
```

## Security notes
- Role checks happen in `lib/services` against the **target record**; menus are cosmetic.
- RLS is enabled on every table; statutory and bank reads run as the `authenticated` role with the user's email claim. The full Aadhaar column is not even granted to that role.
- No secrets in git: `.env.local` is ignored; `.env.example` has blank values.
- The AI model never receives PAN, Aadhaar, UAN or bank data: no tool returns them, and user messages are redacted before sending.

## Checking a build on Windows
Double-click **`verify.cmd`**: it installs packages, runs the unit tests, typechecks and builds, and writes everything to `verify-log.txt`.
