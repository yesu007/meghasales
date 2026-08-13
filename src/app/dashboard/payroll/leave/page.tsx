'use client';

// The requests queue and leave-type admin now live under Time & Attendance
// (/dashboard/payroll/timesheet, "Time-off request" / "Time-off policy"
// tabs) as LeaveRequestsPanel/LeaveTypesPanel — kept here too, composed
// from the same two components, for anyone with this page bookmarked.

import LeaveRequestsPanel from '@/components/payroll/LeaveRequestsPanel';
import LeaveTypesPanel from '@/components/payroll/LeaveTypesPanel';

export default function LeaveApprovalsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Leave Requests</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Review and decide on employee leave applications</p>
      </div>

      <LeaveRequestsPanel />
      <LeaveTypesPanel />
    </div>
  );
}
