# docs/RULES.md — How Lehar HR implements the policy

`RESEARCH.md` (Part B) is the source of truth for Konkan's policy, written as rules **D1–D7, T1–T9, L1–L14**.
This file restates what the **code** implements, with the rule IDs used in code comments and tests
(`R-EMP-*`, `R-ATT-*`, `R-LV-*`), maps each one to the RESEARCH.md rule, and lists every place where the
build differs from a proposed answer in RESEARCH.md's open questions (so faculty can rule on it).

## Map: code rule → RESEARCH.md rule

| Code rule | RESEARCH.md | Where in code | Tests |
|---|---|---|---|
| R-EMP-01 PAN | D1 | `lib/core/validation.ts`, DB CHECK | `tests/unit/validation-masking.test.ts` |
| R-EMP-02 Aadhaar (12 digits, first 2–9, never shown) | D2 | validation.ts, masking.ts, `employee_statutory.aadhaar_last4` | unit + `checklist.test.ts` |
| R-EMP-03 UAN | D3 | validation.ts | unit |
| R-EMP-04 IFSC | D4 | validation.ts | unit + integration |
| R-EMP-05 Mobile | D5 | validation.ts | unit + integration |
| R-EMP-06 PIN + state dropdown | D6 | validation.ts, employee form | unit |
| R-EMP-07 18+ on joining | D7 | validation.ts, DB CHECK `employee_min_age_18` | unit + integration |
| R-EMP-08…13 code, manager loop, masking, Reveal, audit, never delete | Q2, D1/D2 notes | `lib/services/employees.ts`, DB triggers | integration |
| R-ATT-01 IST | T1 | `lib/core/dates.ts` | unit (two foreign TZs) |
| R-ATT-02 weekly offs per location | T2 | `lib/core/calendar.ts`, `locations.weekly_off_days` | unit + integration |
| R-ATT-03 one row per day | brief A1 | DB UNIQUE + `ON CONFLICT` | integration |
| R-ATT-04 Late after 10:15:00, not on WFH | T5 | `lib/core/day-status.ts` | unit |
| R-ATT-05 day status + precedence | T3, T4, T9 | day-status.ts | unit + integration |
| R-ATT-06 every 3 Lates = 0.5 LOP | T6 | day-status.ts, summary.ts | unit + integration |
| R-ATT-07/08 regularisation, HR correction | T8 | `lib/services/attendance.ts` | integration |
| R-ATT-09 holidays per location | T9 | `holidays.location_id` | unit + integration |
| (WFH, not on off/holiday/leave) | T7 | attendance.ts `markWfh` | — |
| R-LV-01 leave year | L1 | leave-rules.ts | unit |
| R-LV-02 CL/SL credit + pro-rating | L2, L3, L4 | `lib/core/leave-balance.ts` | unit (L4 examples) |
| R-LV-03 EL 1.25 / completed calendar month, carry ≤30 | L5, L6 | leave-balance.ts | unit (L5 examples) |
| R-LV-04/05 working days only, no sandwich, half days | L10 | calendar.ts | unit + integration |
| R-LV-06/12 balance terms, change only on approval | L13 | leave-balance.ts, `lib/services/leave.ts` | unit + integration |
| R-LV-07 excess → LOP offer | L11 | leave-rules.ts, leave-split.ts | unit + integration |
| R-LV-08 certificate for SL > 2 leave days | L12 | leave-rules.ts | unit + integration |
| R-LV-09/10/11/13 30-day limit, overlap, approver, cancel | L14 | leave-rules.ts, leave.ts, DB EXCLUDE | unit + integration |
| R-LV-14 maternity | L7 | leave_types ML | unit |
| R-LV-15 paternity 5 days | L8 | leave_types PL | unit |
| R-LV-16 LOP | L9 | leave_types LOP | unit |

## Where the build differs from RESEARCH.md (for faculty sign-off)

| RESEARCH.md | Proposed there | Built | Why |
|---|---|---|---|
| L1 edge / OQ 17, 20, 22 | Split a 30 Dec–4 Jan request into two linked requests | A request may not cross 31 Dec (R-LV-18); apply twice | Still "being revised"; refusing is safe and simple until faculty rule |
| L13 / OQ 28 | Available = opening + accrued − used − **pending** | Screen shows **Available** (excl. pending) **and** "You can still apply for" (= RESEARCH's available) | The testing checklist says the balance must not change while pending; both numbers are shown so either reading holds |
| L6 | Flag EL above 30 for encashment in December | Carry forward caps at 30; excess not yet flagged in the CSV | Encashment is payroll (out of scope); can add a CSV column |
| T5 / OQ 8 | No Late after approved first-half leave | Half-day leave has no first/second-half choice yet; Late is skipped only on WFH | Needs a "which half" field |
| T7 / OQ 26 | WFH needs manager (and skip-level) approval | WFH is self-marked (before check-in; never on off/holiday/leave days) | Approval chain still undecided |
| T9 / OQ 13, 24 | Optional holidays can be picked per employee | Optional holidays are shown and are working days; take CL for one | Quota still undecided |
| L10 / OQ 18, 23 | Location by effective date | Current location is used | Needs a location-history table |
| OQ 21 | Overtime status for holiday work | Holiday stays Holiday | Brief puts overtime out of scope |
| L7 | 12 weeks from the third child; 80-day eligibility | 182 calendar days per event; HR checks eligibility when approving | Needs child-count data |

## Implemented rules (R-IDs used in code and tests)

Each rule has an ID. The code and tests refer to these IDs (search the repo for `R-LV-04`, for example).

### Employee data
- **R-EMP-01** PAN must match `^[A-Z]{5}[0-9]{4}[A-Z]$` (input is upper-cased first).
- **R-EMP-02** Aadhaar must be exactly 12 digits (spaces allowed on input). It is stored, but no screen, CSV, email, audit entry or AI prompt ever shows it beyond `XXXX XXXX 1234`. **No one, including HR, can reveal it.**
- **R-EMP-03** UAN is optional; if given, it must be exactly 12 digits.
- **R-EMP-04** IFSC must match `^[A-Z]{4}0[A-Z0-9]{6}$`.
- **R-EMP-05** Mobile must match `^[6-9][0-9]{9}$`.
- **R-EMP-06** PIN code must match `^[1-9][0-9]{5}$` (Indian PINs never start with 0). State is chosen from the list of 28 states and 8 union territories.
- **R-EMP-07** The employee must be at least 18 years old on the date of joining.
- **R-EMP-08** The employee code is `KCF` plus 4 digits, generated from a sequence, unique and never changed.
- **R-EMP-09** Every employee except the top of the organisation has exactly one reporting manager. The manager must be active, cannot be the employee, and cannot be anyone in the employee's own reporting chain (no cycles).
- **R-EMP-10** Display masks: PAN `ABCDE****F`, Aadhaar `XXXX XXXX 1234`, bank account `XXXXXX1234` (last 4 only).
- **R-EMP-11** HR may click **Reveal** for PAN or bank account. Every reveal is written to the audit log (who, what, when).
- **R-EMP-12** Every change to a job field (designation, department, location, manager, salary grade, date of joining, last working day, HR-admin flag) or statutory/bank field creates an audit entry: who, field, old value, new value, when. Statutory values are stored **masked** in the audit log.
- **R-EMP-13** Employees are never deleted. Exit means setting `last_working_day`. From the next day (IST) the person cannot use the app.

### Attendance
- **R-ATT-01** All times are stored as UTC instants (`timestamptz`) and always calculated and shown in **Asia/Kolkata (IST)**. The "attendance date" is the IST calendar date.
- **R-ATT-02** Panaji head office: weekly offs are Saturday and Sunday. Verna plant: weekly off is Sunday only.
- **R-ATT-03** There is at most one attendance record per employee per date (a unique constraint). A second check-in does nothing.
- **R-ATT-04** A check-in after **10:15:00 AM IST** (10:15:01 onwards) is Late. Work-from-home check-ins are never Late.
- **R-ATT-05** Day status, applied in this order of precedence:
  1. Before date of joining or after last working day → *not employed* (blank).
  2. Approved full-day leave → **On Leave** (even if the person punched in).
  3. National or State holiday at the employee's location → **Holiday**.
  4. Weekly off at the employee's location → **Weekly Off**.
  5. Marked Work From Home → **Present (WFH)**.
  6. Hours worked = check-out − check-in: **≥ 8 h → Present**, **4 h to < 8 h → Half Day**, **< 4 h → Absent**.
  7. No punch, or a check-in with no check-out on a past date → **Absent** (missed punch, can be regularised). Today with only a check-in → **In progress**. A future date → blank.
  8. Approved **half-day** leave → the day counts 0.5 On Leave. The other half is Present if the person worked ≥ 4 h (or WFH), otherwise 0.5 Absent.
- **R-ATT-06** Every 3 Late marks in a calendar month become **0.5 day LOP** (3 lates = 0.5, 6 lates = 1.0 and so on).
- **R-ATT-07** A regularisation request (date, corrected in/out times, reason) changes attendance **only after approval**. The employee's reporting manager approves; HR may approve any request; nobody approves their own.
- **R-ATT-08** HR may correct any attendance record directly, but must give a reason, and the change is audited.
- **R-ATT-09** Holidays belong to a location. A holiday added for Verna does not affect Panaji.

### Leave
- **R-LV-01** The leave year is 1 January – 31 December.
- **R-LV-02** **CL 8/year** and **SL 7/year** are credited on 1 January. A joiner in the current year gets `quota × months remaining ÷ 12`, where the joining month counts if joining on or before the 15th, rounded **down to the nearest 0.5** (1 July joiner: CL 4, SL 3.5). CL and SL lapse on 31 December.
- **R-LV-03** **EL 15/year** accrues at **1.25 days per completed month of service** in the leave year, counted from the later of 1 January and the date of joining. Unused EL carries forward up to **30 days** (opening balance next year = min(closing balance, 30)).
- **R-LV-04** Leave days are **working days only** for that employee's location. Weekly offs and National or State holidays inside the range are **never counted** (Konkan has **no sandwich rule**).
- **R-LV-05** Half-day leave is allowed only for CL, SL and LOP, and only when from-date = to-date.
- **R-LV-06** Balance per type: `opening + accrued + adjustment − used`, where *used* = approved requests. **Pending requests do not reduce the balance**; they are shown separately, and `available − pending` is the most that can still be applied for.
- **R-LV-07** If the days requested exceed what can still be applied for, the app offers to **convert the excess to LOP**. The paid part covers the earliest working days in the range and the rest becomes LOP, in one request.
- **R-LV-08** SL of **more than 2 days** in one request needs a medical certificate upload (PDF, JPG or PNG, max 2 MB).
- **R-LV-09** The from-date cannot be more than **30 days in the past** (IST).
- **R-LV-10** A request may not overlap another pending or approved request of the same employee, and must fall within employment dates.
- **R-LV-11** The **employee's reporting manager** approves (HR Admin may approve anyone's). **Nobody approves their own leave.** A comment is required for rejection.
- **R-LV-12** Balance changes **only on approval**. Approval re-checks the balance inside a database transaction that locks the rows.
- **R-LV-13** An employee can cancel a **pending** request, or an **approved** request whose start date is after today (IST). The balance is restored automatically because *used* is calculated from approved requests.
- **R-LV-14** Maternity: **26 weeks** (182 calendar days) per event for the first two children, 12 weeks from the third. Only for employees recorded as female. Counted in calendar days, as the Act defines the benefit in weeks. Eligibility (80 days worked in the past 12 months) is checked by HR during approval.
- **R-LV-15** Paternity: **5 working days** per event (company policy), only for employees recorded as male.
- **R-LV-16** LOP: unlimited, half-day allowed, no balance.
- **R-LV-17** Email: the manager is emailed on a new request; the employee is emailed on approval or rejection.
- **R-LV-18** One request may not cross 31 December (balances belong to a leave year); apply for each year separately.

### What a "sandwich rule" is (and why Konkan does not have one)

A **sandwich rule** charges the weekends or holidays that fall *between* two leave days as leave.
Example at the Panaji head office: leave on **Friday and Monday**. Without a sandwich rule this is
**2 days** of leave. With one, the Saturday and Sunday in the middle are also charged: **4 days**.
Indian law does not require or forbid it. It is a company choice, meant to stop people stretching
long weekends cheaply. Konkan explicitly has **no sandwich rule** (R-LV-04), and the testing
checklist expects "Friday to Monday at head office = 2 days".

---

## Build-time questions

| # | Question | What Lehar HR does until answered |
|---|---|---|
| Q-1 | Konkan SL is 7 days, but the Goa 2025 Act s.20(2)(a) gives 9 days of sick leave. Should SL be raised to 9? | Uses 7 as the brief says; HR can change the quota in Settings |
| Q-2 | The brief says "Aadhaar never displayed unmasked anywhere" and also "masked unless HR clicks Reveal". | The stricter rule wins: Reveal works for PAN and bank account only, **never Aadhaar** |
| Q-3 | Do Optional holidays have a per-employee quota? | No quota; they are working days and an employee applies CL |
| Q-4 | Can a manager directly correct attendance? | No. "Request only" is read as: manager may raise a regularisation for a direct report, which HR approves |

---

