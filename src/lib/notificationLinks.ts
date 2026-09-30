// Where clicking a notification should take the user, or null if it has no
// dedicated screen (the header dropdown then falls back to the full
// Notifications page). Pure — used by both the header dropdown and the
// Notifications page so they always agree.
export interface LinkableNotification {
  type: string;
  entityType: string | null;
  entityId: number | null;
}

export function getNotificationHref(n: LinkableNotification): string | null {
  if (n.type === 'PASSWORD_RESET_REQUEST' && n.entityType === 'USER' && n.entityId) {
    return `/dashboard/users/${n.entityId}/reset-password`;
  }
  if (n.type === 'MANUAL_ATTENDANCE_APPLIED') return '/dashboard/payroll/timesheet?tab=manual';
  if (n.type === 'LEAVE_APPLIED') return '/dashboard/payroll/timesheet?tab=requests';
  if (n.type === 'MANUAL_ATTENDANCE_DECIDED') return '/dashboard/payroll/my-attendance';
  return null;
}
