'use client';

// Its own top-level Payroll module, next to Time & Attendance in the
// sidebar (see dashboard/layout.tsx) — deliberately not a tab inside Time &
// Attendance, and deliberately not under My Space.

import ShiftMasterPanel from '@/components/payroll/ShiftMasterPanel';

export default function ShiftMasterPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Shift Master</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Define shifts and map them to employees</p>
      </div>
      <ShiftMasterPanel />
    </div>
  );
}
