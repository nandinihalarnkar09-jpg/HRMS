import type { LocationCalendar } from '../../lib/core/calendar';
import type { LeaveTypeRule } from '../../lib/core/leave-balance';

// Panaji head office: Sat + Sun off. Verna plant: Sun off (R-ATT-02)
export const PANAJI: LocationCalendar = {
  weeklyOffDays: [0, 6],
  holidays: [
    { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'NATIONAL' },
    { date: '2026-12-25', name: 'Christmas', type: 'STATE' },
    { date: '2026-01-01', name: 'New Year', type: 'OPTIONAL' },
  ],
};
export const VERNA: LocationCalendar = {
  weeklyOffDays: [0],
  holidays: [
    { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'NATIONAL' },
    { date: '2026-12-25', name: 'Christmas', type: 'STATE' },
    { date: '2026-09-15', name: 'Ganesh Chaturthi (2nd day)', type: 'STATE' },
  ],
};

const base = {
  monthlyRate: null, carryForwardMax: 0, requiresBalance: true, countsCalendarDays: false,
  eligibleGender: null, certRequiredAfterDays: null, perEventDays: null,
} as const;

export const CL: LeaveTypeRule = { ...base, code: 'CL', name: 'Casual Leave', annualQuota: 8, accrualMethod: 'YEAR_START_PRORATED', halfDayAllowed: true };
export const SL: LeaveTypeRule = { ...base, code: 'SL', name: 'Sick Leave', annualQuota: 7, accrualMethod: 'YEAR_START_PRORATED', halfDayAllowed: true, certRequiredAfterDays: 2 };
export const EL: LeaveTypeRule = { ...base, code: 'EL', name: 'Earned Leave', annualQuota: 15, accrualMethod: 'MONTHLY', monthlyRate: 1.25, carryForwardMax: 30, halfDayAllowed: false };
export const ML: LeaveTypeRule = { ...base, code: 'ML', name: 'Maternity Leave', annualQuota: null, accrualMethod: 'ON_REQUEST', halfDayAllowed: false, requiresBalance: false, countsCalendarDays: true, eligibleGender: 'Female', perEventDays: 182 };
export const PL: LeaveTypeRule = { ...base, code: 'PL', name: 'Paternity Leave', annualQuota: null, accrualMethod: 'ON_REQUEST', halfDayAllowed: false, requiresBalance: false, eligibleGender: 'Male', perEventDays: 5 };
export const LOP: LeaveTypeRule = { ...base, code: 'LOP', name: 'Loss of Pay', annualQuota: null, accrualMethod: 'NONE', halfDayAllowed: true, requiresBalance: false };
