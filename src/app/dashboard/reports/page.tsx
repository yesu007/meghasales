'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon, ChartBarSquareIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '@/hooks/usePermissions';
import { REPORTS, REPORT_GROUPS, ReportDefinition } from '@/lib/reports/registry';

// The Reports hub: a searchable catalog of every report built under
// /dashboard/reports, grouped by area. Driven entirely by the registry in
// src/lib/reports/registry.ts — this page never needs editing to add one.
//
// Why a hub page rather than a flat list of nav links: reports are the one
// part of the app that grows without bound, and a report name on its own
// ("Aging", "Variance") tells a first-time user nothing. Grouping plus a
// one-line description is what keeps this usable at 15 reports, and the
// search box is what keeps it usable past that.
export default function ReportsPage() {
  const { has } = usePermissions();
  const [search, setSearch] = useState('');

  // Permission filtering mirrors the nav's own rule: hide what the viewer
  // cannot run, rather than showing a row that 403s when clicked. A report
  // with no `permission` is visible to anyone who can reach this page.
  const visible = useMemo(
    () => REPORTS.filter((r) => !r.permission || has(r.permission)),
    [has]
  );

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }, [visible, search]);

  const grouped = useMemo(
    () => REPORT_GROUPS
      .map((group) => ({ group, reports: matched.filter((r) => r.group === group) }))
      .filter((g) => g.reports.length > 0),
    [matched]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            {visible.length} report{visible.length === 1 ? '' : 's'} available to you
          </p>
        </div>
        {visible.length > 0 && (
          <div className="relative w-full sm:w-72">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
          <ChartBarSquareIcon className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-700 font-medium mt-3">
            {search ? 'No reports match your search' : 'No reports yet'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? 'Try a different word.' : 'Reports will appear here as they are built.'}
          </p>
        </div>
      ) : (
        grouped.map(({ group, reports }) => (
          <section key={group}>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</h2>
              <span className="text-xs text-slate-400">
                {reports.length} report{reports.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {reports.map((report) => <ReportRow key={report.key} report={report} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// A planned report renders as a non-interactive row rather than a dead link
// — the reader can see what is coming without a click that goes nowhere.
function ReportRow({ report }: { report: ReportDefinition }) {
  const body = (
    <div className="flex items-start justify-between gap-4 px-4 sm:px-5 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${report.status === 'available' ? 'text-slate-800' : 'text-slate-400'}`}>
            {report.name}
          </span>
          {report.status === 'planned' && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
              Coming soon
            </span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${report.status === 'available' ? 'text-slate-500' : 'text-slate-400'}`}>
          {report.description}
        </p>
      </div>
      {report.status === 'available' && <span className="text-slate-400 text-sm shrink-0">→</span>}
    </div>
  );

  if (report.status !== 'available') {
    return <div className="bg-slate-50/60 cursor-default">{body}</div>;
  }
  return (
    <Link href={report.href} className="block hover:bg-amber-50/60 transition-colors">
      {body}
    </Link>
  );
}
