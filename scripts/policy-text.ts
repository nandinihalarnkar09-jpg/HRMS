/**
 * The ONLY text the agent's explain_policy tool may answer from (seeded into policy_documents;
 * HR can edit it in Settings → Policy text). Mirrors RESEARCH.md Part B and docs/RULES.md.
 */
export const POLICY_DOCS = [
  {
    slug: 'leave-policy',
    title: 'Konkan Coastal Foods: Leave policy',
    body: `## Leave year
- The leave year runs from 1 January to 31 December. A single leave request cannot cross 31 December; apply for each year separately.

## Casual Leave (CL)
- Casual Leave (CL) is 8 days a year, credited on 1 January. Employees who join during the year get a pro-rated credit: 8 × months remaining ÷ 12, rounded down to the nearest half day (the joining month counts if you join on or before the 15th). Example: joining on 1 July gives 4 days CL.
- Unused Casual Leave lapses on 31 December. It is not carried forward or encashed.
- Casual Leave can be taken as a half day. For a half day, choose the first half (morning) or the second half (afternoon).

## Sick Leave (SL)
- Sick Leave (SL) is 7 days a year, credited on 1 January and pro-rated for joiners the same way as CL. Example: joining on 1 July gives 3.5 days SL.
- Unused Sick Leave lapses on 31 December.
- Sick Leave can be taken as a half day.
- Sick Leave of more than 2 days in one request needs a medical certificate (PDF, JPG or PNG, up to 2 MB) uploaded with the request.

## Earned Leave (EL)
- Earned Leave (EL) is 15 days a year, accrued at 1.25 days for every completed calendar month of service in the year. The joining month counts only if you join on the 1st; a month is credited on its last day.
- Unused Earned Leave is carried forward to next year up to a maximum of 30 days. Anything above 30 days lapses.
- Earned Leave cannot be taken as a half day.

## Maternity Leave
- Maternity Leave follows the Maternity Benefit Act (now part of the Code on Social Security, 2020): 26 weeks for each of the first two children and 12 weeks from the third child. It is counted in calendar days. Eligibility (80 days worked in the 12 months before the expected delivery) is confirmed by HR.

## Paternity Leave
- Paternity Leave is 5 working days per child (company policy).

## Loss of Pay (LOP)
- Loss of Pay (LOP) leave is unlimited and can be taken as a half day. Salary is deducted for LOP days by the payroll vendor.
- If you apply for more leave than your balance allows, Lehar HR offers to convert the extra days to Loss of Pay. The earliest working days are paid from your balance and the rest are LOP.

## Counting leave days
- Leave days are working days only. Weekly offs and holidays inside a leave period are never counted as leave.
- Konkan has no sandwich rule. Example: at the Panaji head office, leave on Friday and Monday counts as 2 days, because Saturday and Sunday are weekly offs.
- A Saturday is a working day at the Verna plant but a weekly off at the Panaji head office.
- Leave cannot be applied for more than 30 days in the past.

## Balance and approval
- Your balance = opening (carried forward) + accrued − leave already approved. Pending requests do not reduce your balance, but you cannot apply for more than your balance minus pending requests.
- Your reporting manager approves or rejects leave with a comment. HR can also approve. Nobody can approve their own leave.
- Your balance changes only when leave is approved.
- You can cancel a pending request, or an approved request that has not started yet. The balance is restored.
- Your manager is emailed when you apply, and you are emailed when it is approved or rejected.`,
  },
  {
    slug: 'attendance-policy',
    title: 'Konkan Coastal Foods: Attendance policy',
    body: `## Working days and weekly offs
- Panaji head office works Monday to Friday. Saturday and Sunday are weekly offs.
- Verna plant works Monday to Saturday. Sunday is the weekly off.
- Holidays are set per location. National and State holidays are days off. Optional holidays are shown on the calendar but are working days; apply for CL if you want one off.

## Check-in, check-out and hours
- Check in and check out once a day in Lehar HR. All times are Indian Standard Time (IST).
- Working 8 hours or more is a Present day. Working 4 hours to under 8 hours is a Half Day. Under 4 hours, or no punch, is Absent.

## Late marks
- Checking in after 10:15 AM is marked Late. It does not count as Late on a day when the first half (morning) is on approved half-day leave.
- Every three Late marks in a calendar month convert into half a day of Loss of Pay.

## Work from home
- You can mark a day as Work From Home before checking in. A WFH day counts as Present and is never marked Late.

## Leave and attendance
- A day with approved leave is On Leave, even if you also punched in.

## Missed punch and regularisation
- If you forget to check in or check out, the day shows as Absent. Raise a regularisation request with your actual in and out times and a reason within 30 days. Attendance changes only after your reporting manager approves it.
- HR can correct attendance directly, but must record a reason. Every correction is audited.

## Month-end
- At month end HR sends the payroll vendor a summary per employee: days present, WFH days, leave days by type, LOP days, holidays and weekly offs.`,
  },
];
