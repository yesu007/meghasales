// Manual attendance request rules — pure (no Prisma), shared by the apply
// API and its tests. See the ManualAttendanceRequest model for the workflow.

export const MANUAL_ATTENDANCE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
// Requests that still hold the date — a new one for the same day is refused
// while one of these exists (REJECTED/CANCELLED free it up to apply again).
export const ACTIVE_MANUAL_STATUSES = ['PENDING', 'APPROVED'];

// Same linear workflow as leave requests: PENDING is decided by an
// approver (APPROVED/REJECTED); the owner can withdraw PENDING, and an
// approver can cancel an APPROVED one (with a reason). REJECTED/CANCELLED
// are terminal — the employee just applies again.
export const MANUAL_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export interface ManualAttendanceInput {
  attendanceDate: string;
  loginTime: string;
  logoutTime: string;
  workLocation?: string | null;
  reason: string;
}

// Returns the cleaned input, or an error message. `today` is the
// employee's current date (YYYY-MM-DD) — a future day can't be claimed.
export function validateManualAttendance(body: Record<string, unknown>, today: string): { value: ManualAttendanceInput } | { error: string } {
  const attendanceDate = String(body.attendanceDate ?? '').trim();
  const loginTime = String(body.loginTime ?? '').trim().slice(0, 5);
  const logoutTime = String(body.logoutTime ?? '').trim().slice(0, 5);
  const reason = String(body.reason ?? '').trim();
  const workLocation = String(body.workLocation ?? '').trim();

  if (!DATE_RE.test(attendanceDate) || Number.isNaN(new Date(`${attendanceDate}T00:00:00Z`).getTime()) || new Date(`${attendanceDate}T00:00:00Z`).toISOString().slice(0, 10) !== attendanceDate) {
    return { error: 'Choose a valid date' };
  }
  if (attendanceDate > today) return { error: 'You can only apply for today or an earlier date' };
  if (!TIME_RE.test(loginTime)) return { error: 'Login time must be a valid time (HH:mm)' };
  if (!TIME_RE.test(logoutTime)) return { error: 'Logout time must be a valid time (HH:mm)' };
  if (timeToMinutes(logoutTime) <= timeToMinutes(loginTime)) return { error: 'Logout time must be after login time' };
  if (!reason) return { error: 'Reason is required' };
  if (reason.length > 500) return { error: 'Reason is too long (max 500 characters)' };
  if (workLocation.length > 120) return { error: 'Work location is too long (max 120 characters)' };

  return { value: { attendanceDate, loginTime, logoutTime, reason, workLocation: workLocation || null } };
}
