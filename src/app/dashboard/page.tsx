'use client';

import { useSession } from 'next-auth/react';

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s your CRM overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Leads', value: '—', color: 'bg-blue-50 text-blue-700' },
          { label: 'Active Quotations', value: '—', color: 'bg-amber-50 text-amber-700' },
          { label: 'Scheduled Demos', value: '—', color: 'bg-purple-50 text-purple-700' },
          { label: 'Implementations', value: '—', color: 'bg-green-50 text-green-700' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className={`text-3xl font-bold mt-2 ${kpi.color.split(' ')[1]}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard/leads" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Manage Leads
          </a>
          <a href="/dashboard/quotations" className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            Create Quotation
          </a>
          <a href="/dashboard/demos" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            Schedule Demo
          </a>
        </div>
      </div>
    </div>
  );
}
