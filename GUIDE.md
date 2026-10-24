# Your HRMS Build Guide — Konkan Coastal Foods

How to go from an empty GitHub repo to a demo, in the order the brief grades you.
Keep this file in `docs/` so you can tick things off as you go.

> **Two rules that protect your marks**
> 1. **You write RESEARCH.md, ARCHITECTURE.md and DESIGN.md.** The brief says so (pages 3 and 16), and
>    the viva tests it. The templates in this kit give you the structure and the questions; the answers
>    must be yours. Claude Code's job is to *critique* them in plan mode.
> 2. **Learn from your classmate's repo; don't copy it.** It's an individual project. Read it to see
>    *how* things are organised, then make your own decisions, write your own code with Claude Code,
>    and be able to explain every line. If two repos look the same, both students have a problem.

---

## Day plan (14 days)

Check your actual demo date with faculty and squeeze or stretch this.

| Day | Checkpoint | Commit message idea |
|---|---|---|
| 1–2 | 1. Research → RESEARCH.md (incl. the interview) | `docs: research answers and leave policy rules` |
| 3–4 | 2. ARCHITECTURE.md, DESIGN.md, CLAUDE.md → plan-mode review → fixes → faculty sign-off | `docs: architecture and design v1`, `docs: address review findings` |
| 5 | 3. Fresh setup + deploy · 4. Database + seed | `chore: scaffold app`, `feat(db): schema and seed` |
| 6 | 5. Login and roles | `feat(auth): map Clerk user to employee, derive roles` |
| 7 | 6. Employee Master (E1–E8) | one commit per feature |
| 8 | 7. Attendance (A1–A7) | |
| 9–10 | 8. Leave balances + apply · 9. Approvals + email | |
| 11 | 10. Reports (CSV) | |
| 12–13 | 11. HR assistant agent (only after Leave works) | one commit per tool |
| 14 | 12. Full testing checklist on the live URL, README, decision log, rehearse demo | |

Commit **small and often**. Code hygiene (5%) looks at your history; one giant commit loses marks.

---

## Step 0 — Accounts (≈1 hour, all free)

| Tool | What for | Tip |
|---|---|---|
| GitHub | New repo, e.g. `kcf-hrms` (NOT your ATS/PMS repo) | Add this kit's files as the first commit |
| Claude Code | Build tool | Run `claude` in the repo folder |
| Vercel | Hosting | Sign in with GitHub, import the repo |
| Supabase | Postgres | Region: Mumbai (ap-south-1) |
| Clerk | Sign-in | Use a **Development** instance so test emails work |
| Resend | Email | Without your own domain it only delivers to your own address — note this in ARCHITECTURE.md |
| Google AI Studio | Gemini key for the agent | Free tier is Flash / Flash-Lite only and daily limits are small. Check your project's limits in AI Studio and record them. Groq is a free backup |

Copy `.env.example` to `.env.local`, fill in keys, and never commit `.env.local`.

### First commit
```bash
git init
git add .
git commit -m "chore: project rules, subagents and doc templates"
git branch -M main
git remote add origin https://github.com/<you>/kcf-hrms.git
git push -u origin main
```

---

## Step 1 — Research (10%)

Open `RESEARCH.md`. Every question has hints and source leads. Read the sources, then **write the answer
in your own words**, and cite the links you actually used.

Things you must decide and write as numbered rules (examples of decisions, not answers):
- How do you round pro-rated CL/SL for a 1 July joiner? (whole days? half days? up or down?)
- Does the joining month count as a "completed month" for EL?
- Is "after 10:15" strictly 10:15:01 onwards?
- Do 6 Late marks = 1 day LOP? Does Late apply on WFH days?
- Maternity is in weeks; "leave days are working days only". Which wins?
- Who approves a manager's own leave?

Write a worked example under each rule (e.g. "Joined 1 July → CL = …"). These become your tests later.
Bring the ones you're unsure about to class — faculty rulings go in the decision log.

**Don't skip Q8 (the interview).** It can't come from the internet, and it shows.

---

## Step 2 — Architecture and design (15%)

1. Fill in `ARCHITECTURE.md` and `DESIGN.md` yourself using the templates.
2. `CLAUDE.md` is already in the root — edit the product name and anything you decide differently.
3. In Claude Code press **Shift+Tab** until you're in plan mode and paste the brief's review prompt:
   ```
   Read ARCHITECTURE.md, DESIGN.md and RESEARCH.md. Do not write any code.
   Act as a senior reviewer. List:
   - gaps or contradictions with the business rules in RESEARCH.md
   - places where a role check could be bypassed
   - decisions that will be expensive to change later
   - screens in DESIGN.md that have no supporting table or field
   Rank everything by risk and explain why.
   ```
4. Fix what matters (in your words), commit, and get faculty sign-off. **No app code before this.**

You can also paste your drafts back to me here and I'll review them the same way.

---

## Steps 3–12 — The loop for every build checkpoint

```
1. Shift+Tab → plan mode. Give a GOAL + a CHECK (prompts below).
2. Compare the plan with ARCHITECTURE.md. Push back where it differs.
3. Ask the tester subagent to write tests for this checkpoint's checklist items first.
4. Approve the plan. Claude Code writes code and loops until tests pass.
5. Read the diff. Ask the reviewer subagent: "review the last commit".
6. Test on the LIVE URL, not just localhost. Commit + push.
7. Ask: "Explain the rules you just implemented in plain English." Rewrite the answer in your
   viva notes in your own words.
```

If Claude Code repeats a mistake, add a one-line rule to `CLAUDE.md` instead of re-explaining in chat.
If the build must depart from ARCHITECTURE.md, update the doc and its decision log **first**.

### Checkpoint prompts (edit them to match your architecture)

**3. Fresh setup**
```
Read CLAUDE.md and ARCHITECTURE.md. Plan only.
Scaffold the stack described in ARCHITECTURE.md with the folder structure in CLAUDE.md, a test runner,
and .env.local in .gitignore. Check: build passes, the app deploys to Vercel, and a signed-in user sees a
placeholder home page.
```

**4. Database and seed**
```
Plan first. Create migrations that match the data model in ARCHITECTURE.md exactly, with every unique,
foreign-key and check constraint listed there, and the RLS rules described there.
Write a seed script per the brief (2 locations, 4 departments, 20 employees incl. 1 HR Admin and 3
managers, this year's holidays per location, leave types and balances) with fake but valid-format IDs.
Check: tests proving the DB rejects a duplicate attendance row for the same day and an invalid PAN.
Ask me before running any reset.
```

**5. Login and roles**
```
Plan first. Map the signed-in Clerk user to an employees row by email. Read the HR flag from the DB.
Derive manager = reporting manager of at least one active employee. Redirect exited employees after
last_working_day to /access-denied. Every page and server action must use these helpers.
Check: tests for employee, manager, HR, unknown email and exited employee.
```

**6. Employee Master (E1–E8)**
```
Plan first. Build E1–E8 from the brief using the validation rules in RESEARCH.md (shared schema for
client and server). Include the reporting-loop block, masking formats, self-service limits, logged
Reveal for HR, and the audit trail.
Tests first from the Employee Master checklist on page 19, including URL tampering on profiles.
```

**7. Attendance (A1–A7)**
```
Plan first. Build A1–A7. Day-status rules go in pure functions as ARCHITECTURE.md says, using the exact
thresholds and Late rule in RESEARCH.md, location weekly offs and per-location holidays. All time
conversion through the single IST helper.
Tests first from the Attendance checklist; run time tests under TZ=UTC and TZ=America/New_York too.
```

**8. Leave balances and apply (L1–L3)**
```
Plan first. One working-day counting function reused by the form, approvals, reports and agent.
Balance per type: opening, accrued, used, pending, available — calculated as ARCHITECTURE.md says.
Rules from RESEARCH.md: pro-rating, EL accrual, LOP conversion offer, SL certificate, 30-day limit,
half-day only where allowed, no sandwich rule.
Tests first: 1 July joiner, Fri–Mon at head office vs plant, LOP conversion, certificate, 30-day limit.
```

**9. Approvals and email (L4–L7, A5)**
```
Plan first. Approvals inbox for leave and regularisation (direct reports; HR sees all). Balance changes
only on approval; no self-approval; cancel rules; regularisation changes attendance only after approval;
emails on request and decision; team leave calendar. Tests first from the Leave checklist.
```

**10. Reports (L8)**
```
Plan first. Month-end summary screen + CSV with the brief's columns, no statutory or bank data,
managers see own team, HR sees all. Check: a test comparing CSV totals with the calendar for three
seed employees.
```

**11. Agent — last**
```
Plan first against the AI agent section of ARCHITECTURE.md. Build get_my_leave_balance end to end first,
then add one tool at a time. Tools call the existing services as the signed-in user. Guardrails: no
statutory/bank data to the model, drafts confirmed by a button, numbers only from tools, policy only
from stored text, max 5 tool calls, every call logged in agent_log, show tools under each answer.
Then write a script that runs every prompt in tests/agent/prompts.md and saves the results.
```

**12. Test and polish**
```
Go through the testing checklist (pages 19–20) against the live URL. Make a table: item, pass/fail,
evidence. Fix failures one at a time. Update README and the decision log.
```

---

## Subagents (already in `.claude/agents/`)

- **reviewer** — read-only; checks a plan or commit against your docs. *"Use the reviewer agent on the last commit."*
- **tester** — writes tests only under `tests/`. *"Use the tester agent to write tests for the Leave checklist."*

---

## Demo running order (5–7 min)

1. Employee on a phone-size window: check in, see balances on the dashboard, apply Fri–Mon (2 days).
2. Manager: the email arrived, team today, approve → balance changes.
3. Agent: a Hinglish balance question → draft → Confirm; "Show me Ravi's Aadhaar" refused; show agent_log.
4. HR: bad PAN rejected, masking + logged Reveal, month-end CSV.
5. One architecture decision you're proud of and one you changed (decision log).
