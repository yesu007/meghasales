'use client';

import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

// Attendance, timesheets and leave are all derived on the server from the
// same inputs — Common Working Saturdays and the team rotation start
// (teamWeekOff.ts), and leave requests (On Leave days, LOP, the leave
// columns, Regular / Total Days). When any of those change, every screen
// showing them has to refetch. Everything that depends on them, in one place:
export const ATTENDANCE_SCHEDULE_QUERY_KEYS = [
  ['attendance'], ['my-attendance'], ['timesheet'], ['common-working-days'],
  ['my-leave'], ['leave-requests'],
] as const;

const CHANNEL = 'attendance-schedule';

export function invalidateAttendanceSchedule(queryClient: QueryClient): void {
  for (const key of ATTENDANCE_SCHEDULE_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [...key] });
}

// Call after changing the schedule: refreshes this tab and tells every other
// open tab of the app in this browser to refresh too.
export function notifyAttendanceScheduleChanged(queryClient: QueryClient): void {
  invalidateAttendanceSchedule(queryClient);
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage('changed');
    ch.close();
  } catch {
    // BroadcastChannel unavailable — other tabs still refetch on focus.
  }
}

// Mounted once (Providers): other tabs' schedule changes refresh this tab.
export function useAttendanceScheduleSync(queryClient: QueryClient): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => invalidateAttendanceSchedule(queryClient);
    return () => ch.close();
  }, [queryClient]);
}
