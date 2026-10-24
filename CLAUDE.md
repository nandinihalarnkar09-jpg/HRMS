# CLAUDE.md — <Your product name> (HRMS for Konkan Coastal Foods)

Claude Code reads this at the start of every session. Keep it short and true.
When Claude repeats a mistake, add a one-line rule here instead of correcting it in chat.

## Project
HRMS for Konkan Coastal Foods: 180 employees, head office in Panaji (Mon–Fri), plant in Verna (Mon–Sat), Goa.
Modules: Employee Master, Attendance, Leave, and an HR assistant agent that calls tools.
Payroll is out of scope; we only produce a month-end attendance summary CSV for the payroll vendor.

## Source of truth (in this order)
1. `RESEARCH.md` — business rules and leave policy, written as numbered rules
2. `ARCHITECTURE.md` — stack, data model, access control, where logic lives, decision log
3. `DESIGN.md` — flows, wireframes, design system, status colours

If a task conflicts with these, STOP and tell me. Never silently depart from them.
If the build must change, I update ARCHITECTURE.md and its decision log first.

## Stack
<!-- Fill in after you finalise ARCHITECTURE.md. Default from the brief: -->
- Framework / hosting: Next.js (App Router, TypeScript) on Vercel
- Database: Supabase Postgres
- Auth: Clerk — sign-in only; roles live in our database, never in Clerk
- Email: <free service> · AI: <model + library>
- Validation: <library>, one schema shared by client and server

## Folder rules
<!-- Copy the folder structure you decide in ARCHITECTURE.md here. Example shape: -->
```
src/app/...                 pages and server actions — no business rules here
src/modules/<module>/       employees, attendance, leave, reports, agent
  rules.ts                  pure business rules, unit tested
  service.ts                database access + permission checks
src/lib/time.ts             the ONLY place that converts to/from IST
src/lib/validation.ts       Indian field rules (PAN, Aadhaar, UAN, IFSC, mobile, PIN)
src/lib/mask.ts             masking helpers
supabase/migrations/        schema; add a NEW file for each change, never edit an applied one
tests/                      unit, integration (testing checklist), agent prompts
```

## Non-negotiable rules
- **All times in IST (Asia/Kolkata)**, stored and shown, whatever the server time zone. Use `src/lib/time.ts`.
- **Never commit secrets.** Keys go in `.env.local` and Vercel env vars; `.env.example` has blank values.
- **Role checks on the server** in every page, server action, route and agent tool. Hiding a button is not a check.
- Only the HR Admin flag is stored. Manager = reporting manager of at least one active employee.
- **PAN, Aadhaar and bank numbers are masked everywhere** (UI, CSV, logs). HR Reveal is explicit and logged.
- Employee records are never deleted.
- **Agent:** acts as the signed-in user via the same services; never sees statutory/bank data, DB credentials
  or service keys; every write is a draft confirmed by a human; numbers only from tools; policy answers only
  from stored policy text; max 5 tool calls per question; every call logged in `agent_log`.
- Follow DESIGN.md for components and status colours. Don't invent new ones.

## How we work
- Start each checkpoint in plan mode; I compare the plan with ARCHITECTURE.md before approving.
- Tests first for each checklist item, then code, then loop until tests pass.
- Run tests and type-check before every commit. Small commits with clear messages.
- Ask me before: database resets, dropping tables, editing applied migrations, new dependencies, touching `.env*`.
- After implementing a rule, explain it in plain English — I will be asked in the viva.
- Stay in scope: no payroll, PF/ESI/PT/TDS, recruitment, performance reviews, biometrics, shifts, mobile app.
