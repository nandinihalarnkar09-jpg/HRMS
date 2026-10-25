/**
 * Pure authorization rules (ARCHITECTURE.md §4.2). Services load the target record and ask
 * these functions; nothing here touches the DB so every rule is unit-tested.
 */
export type Actor = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  isHrAdmin: boolean;
  isManager: boolean;
  locationId: number;
  /** ids of ACTIVE direct reports (loaded once per request) */
  directReportIds: string[];
};

export type Target = { id: string; reportingManagerId: string | null };

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this.') { super(message); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends Error {
  constructor(message = 'Not found.') { super(message); this.name = 'NotFoundError'; }
}
export class ValidationError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) { super(message); this.name = 'ValidationError'; }
}

export const isSelf = (a: Actor, t: Target | string) => a.id === (typeof t === 'string' ? t : t.id);
export const isDirectManager = (a: Actor, t: Target) => t.reportingManagerId === a.id;

/** Profile: own or HR only. Managers see team data through team views, not full profiles. */
export function canViewProfile(a: Actor, t: Target): boolean {
  return isSelf(a, t) || a.isHrAdmin;
}

export function canEditContact(a: Actor, t: Target): boolean {
  return isSelf(a, t) || a.isHrAdmin;
}

export function canEditJob(a: Actor): boolean { return a.isHrAdmin; }

export function canRevealSensitive(a: Actor, field: string): boolean {
  // D-3: Aadhaar can never be revealed
  return a.isHrAdmin && (field === 'pan' || field === 'account_number');
}

/** Team attendance / team leave / month-end: direct reports (managers), everyone (HR). */
export function canSeeTeamMember(a: Actor, t: Target): boolean {
  return a.isHrAdmin || isDirectManager(a, t);
}

/** R-LV-11 / R-ATT-07: reporting manager or HR, and never yourself. */
export function canApprove(a: Actor, t: Target): boolean {
  if (isSelf(a, t)) return false;
  return a.isHrAdmin || isDirectManager(a, t);
}

/**
 * Regularisation raised BY a manager on behalf of a report must be approved by HR (D-6),
 * and nobody approves a request about themselves or one they raised.
 */
export function canApproveRegularisation(a: Actor, t: Target, requestedBy: string): boolean {
  if (isSelf(a, t) || a.id === requestedBy) return false;
  if (a.isHrAdmin) return true;
  return isDirectManager(a, t) && requestedBy === t.id;
}

export function canRaiseRegularisationFor(a: Actor, t: Target): boolean {
  return isSelf(a, t) || isDirectManager(a, t) || a.isHrAdmin;
}

export function roleLabel(a: Pick<Actor, 'isHrAdmin' | 'isManager'>): 'HR Admin' | 'Manager' | 'Employee' {
  return a.isHrAdmin ? 'HR Admin' : a.isManager ? 'Manager' : 'Employee';
}
