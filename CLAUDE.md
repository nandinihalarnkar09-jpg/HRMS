# CLAUDE.md: Lehar HR (Konkan Coastal Foods HRMS)

## What this is
An HRMS for Konkan Coastal Foods (about 180 people; head office in Panaji, plant in Verna, Goa).
Modules: Employee Master, Attendance, Leave, plus an "Ask HR" AI agent that calls server tools.
Payroll is OUT of scope; we only produce the month-end attendance CSV.

## Read before changing anything
- `RESEARCH.md` Part B: Konkan's policy as rules D1–D7, T1–T9, L1–L14. **Rules are law.**
- `docs/RULES.md`: the code's rule IDs (R-EMP-*, R-ATT-*, R-LV-*), mapped to D/T/L, plus every open difference.
- `ARCHITECTURE.md`: stack, data model, access control, decision log.
- `DESIGN.md`: tokens, status colours, components, wireframes. **Follow DESIGN.md for all UI.**

## Stack
Next.js 16 App Router (TypeScript) · Supabase Postgres via postgres.js · Clerk (identity only) ·
Resend (email) · Vercel AI SDK v5 + Gemini (Groq fallback) · Tailwind v4 · tests with `tsx --test`.
Next.js 16 uses `proxy.ts` (not middleware.ts), and `params`/`searchParams` are Promises.

## Folder rules
- `lib/core/`: PURE functions only (no DB, no fetch, no Date.now() without an injected "today"). Every rule here has a unit test in `tests/unit/`.
- `lib/services/`: the ONLY place that reads or writes the DB. Every exported function takes `actor` first and authorizes against the target record.
- `app/`: thin. Pages and actions call `getActor()` then services. Never query the DB from a page.
- `lib/agent/`: tools wrap services; never import statutory or bank functions.
- `db/migrations/`: append-only numbered SQL. Never edit an applied migration; add a new one.

## Non-negotiables
- **All times in IST (Asia/Kolkata).** Use `lib/core/dates.ts` (`todayIST`, `istTimeOf`, `formatTimeIST`). Never use `new Date().getDate()`/`toLocaleDateString()` without `timeZone`.
- **Role checks on the server**, in services. Hiding a button is not security.
- **Aadhaar is never shown unmasked**, not even to HR. Select only `aadhaar_last4`. PAN/bank are masked except HR "Reveal", which must write an audit_log row.
- **Never send PAN, Aadhaar, UAN or bank data to the AI model.**
- **Never commit secrets.** `.env.local` is git-ignored; keep `.env.example` with blank values.
- Do not run destructive DB commands (drop, truncate, reset, re-seed a shared DB) without asking.
- Keep the store-only-opening design: available leave balance is CALCULATED, never stored.

## Commands
- `npm run dev`: local dev (set `AUTH_MODE=dev` for the pick-a-user login; never in production)
- `npm test`: unit tests (run under two foreign time zones)
- `npm run test:integration`: services against `TEST_DATABASE_URL`
- `npm run db:setup`: apply migrations + seed to `DATABASE_URL`
- `npm run test:agent`: run the attack/Hinglish prompt file against the live agent
- `npm run typecheck` / `npm run lint` / `npm run build`

## Workflow
Plan first (plan mode) → compare with ARCHITECTURE.md → write or adjust tests → implement → run tests.
If you must depart from ARCHITECTURE.md, update its Decision log first.
