# RESEARCH.md — HR practice in India for the Konkan Coastal Foods HRMS

> **Template — replace every "✍️" with your own words.** Delete the hints when you're done.
> Cite only sources you actually read. Re-check every legal figure against an official source
> (India Code, PIB, the state Labour Department) — blogs and HR-software sites can be outdated.

**Author:** <your name> · **Last updated:** <date>

---

## Part A — Research questions

### Q1. What details does an Indian HR team keep for every employee?
Hints: personal, job, statutory, bank, emergency contact. Which are mandatory for payroll/compliance
(PAN, Aadhaar, UAN, bank)? Which are *sensitive* and why (identity theft, the DPDP Act 2023)?
Who should be able to see each?

✍️

| Field group | Example fields | Mandatory? | Sensitive? | Who can see it |
|---|---|---|---|---|
| Personal | | | | |
| Job | | | | |
| Statutory | | | | |
| Bank | | | | |
| Emergency contact | | | | |

### Q2. How is an employee code formed, and why should it never change?
Hints: prefix + running number (e.g. KCF0001), what payroll, PF records and audit logs link to,
what breaks if it changes or is reused after someone exits.

✍️

### Q3. Leave types in Indian companies; statutory vs company policy
Hints: CL, SL, EL/PL, maternity, paternity, LOP, comp-off. Which come from a law (which one?) and which
are purely company choice? Is paternity leave statutory for private employers?

✍️

### Q4. How does leave accrue, and what happens at year end?
Hints: credited upfront vs monthly vs pro-rated for joiners; carry forward, lapse, encashment.
Give one example of each from a real company policy or HR guide.

✍️

### Q5. Shops and Establishments Act — Goa (or Karnataka / Maharashtra)
Hints: Goa replaced its 1973 Act with the *Goa Shops and Establishments (Regulation of Employment and
Conditions of Service) Act, 2025*. Read the Act text yourself. Note: working hours per day/week, rest
intervals, weekly off, leave entitlements, which establishments it covers.
Worth discussing: the Verna **plant** is a factory — is the Shops Act or factory law (now the OSH Code)
the relevant one there? Also note India's four labour codes were brought into force on 21 Nov 2025 —
how does that change which law you cite?

✍️

| Topic | What the law says (your words) | Section / source |
|---|---|---|
| Daily / weekly working hours | | |
| Rest interval | | |
| Weekly off | | |
| Leave | | |

### Q6. National vs restricted (optional) vs state holiday
Hints: who declares each; how many national holidays; how an optional holiday is "availed";
example Goa state holidays. How should your system treat an optional holiday?

✍️

### Q7. Late arrivals, half days, WFH, missed punches
Hints: grace periods, late-mark-to-LOP conversion, half-day hour thresholds, how WFH is recorded,
regularisation workflows in common Indian HR software.

✍️

### Q8. Interview
Interviewee: <role, company type — no need for a name> · Date: <date> · System they use: <name>

Questions to ask:
1. Which HR system do you use and for what (attendance, leave, payslips)?
2. How do you mark attendance? What happens if you forget?
3. How do you apply for leave and how long does approval take?
4. Do you always know your real leave balance?
5. What do you dislike most about the system? What would you change?
6. Anything your HR team still does on Excel/WhatsApp/paper?

✍️ Summary of answers, and **what you will do differently in your HRMS because of it.**

### Sandwich rule (required by page 9)
Hints: what it is, an example (Fri + Mon leave around a weekend), why some companies use it.
Konkan has no sandwich rule — say what that means for the Fri–Mon case at each location.

✍️

---

## Part B — Konkan Coastal Foods policy, written as rules

Write each rule so a tester can check it. Add a **worked example** under each. Mark anything you had
to interpret with **[Interpretation]** and bring it to class; record the faculty ruling in the
ARCHITECTURE.md decision log.

### Employee data rules
- D1 PAN: ✍️ (format + regex)
- D2 Aadhaar: ✍️
- D3 UAN: ✍️
- D4 IFSC: ✍️ (format + regex)
- D5 Mobile: ✍️
- D6 PIN code and state: ✍️
- D7 Minimum age at joining: ✍️ — example: ✍️

### Attendance rules
- T1 Time zone: ✍️
- T2 Weekly offs per location: ✍️
- T3 Day status by hours worked: ✍️ — examples: exactly 8h → ✍️, 5h → ✍️, 3h59m → ✍️
- T4 Late mark: ✍️ — is 10:15:00 late? ✍️
- T5 Late → LOP conversion: ✍️ — what do 6 Late marks give? ✍️
- T6 Leave vs punch on the same day: ✍️
- T7 WFH: ✍️
- T8 Missed punch / regularisation: ✍️
- T9 Holidays per location and optional holidays: ✍️

### Leave rules
- L1 Leave year: ✍️
- L2 CL: quota, credit date, pro-rating formula, rounding ✍️ — example: joined 1 July → ✍️
- L3 SL: ✍️ — example: joined 1 July → ✍️
- L4 EL accrual: what counts as a "completed month"? ✍️ — example: ✍️
- L5 Carry forward and lapse: ✍️
- L6 Maternity: entitlement and eligibility (cite the law) ✍️ — weeks vs working days? ✍️
- L7 Paternity: ✍️
- L8 LOP and the insufficient-balance offer: ✍️
- L9 Medical certificate for SL: ✍️ (consecutive calendar or working days?)
- L10 Counting leave days: working days only, location weekly offs, holidays, no sandwich ✍️ —
  examples: Fri→Mon at head office ✍️, at plant ✍️
- L11 Back-dating limit: ✍️
- L12 Half-day leave: which types ✍️
- L13 Balance shown to the employee: opening, accrued, used, pending, available — define each ✍️
- L14 Approval and cancellation: who approves whom (incl. a manager's own leave), when cancel is allowed ✍️

### Open questions for faculty
1. ✍️
2. ✍️

---

## Part C — Sources

List what you used. Starting leads (verify each yourself):
- Code on Social Security, 2020 — maternity benefit factsheet, PIB: https://www.pib.gov.in/FactsheetDetails.aspx?Id=150473
- Labour codes effective 21 Nov 2025 — EY alert: https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/alerts-hub/2025/11/new-labour-codes-implemented-across-the-country-effective-21-november-2025.pdf
- Goa Shops and Establishments Act text, India Code: https://www.indiacode.nic.in/bitstream/123456789/22174/1/goa_shops_est_regulation.pdf
- Gemini API rate limits (exact limits shown in AI Studio): https://ai.google.dev/gemini-api/docs/rate-limits
- Digital Personal Data Protection Act, 2023 (for Q1 sensitivity) — find the official text on meity.gov.in

| # | Title | Link | Used for |
|---|---|---|---|
| 1 | | | |
