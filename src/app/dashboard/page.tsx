'use client';

import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';

async function countFor(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.totalElements || 0;
}

async function fetchDashboardStats() {
  const [totalLeads, draftQuotations, sentQuotations, scheduledDemos, rescheduledDemos, implementations] = await Promise.all([
    countFor('/api/leads?size=1'),
    countFor('/api/quotations?status=DRAFT&size=1'),
    countFor('/api/quotations?status=SENT&size=1'),
    countFor('/api/demos?status=SCHEDULED&size=1'),
    countFor('/api/demos?status=RESCHEDULED&size=1'),
    countFor('/api/implementations?size=1'),
  ]);

  return {
    totalLeads,
    activeQuotations: draftQuotations + sentQuotations,
    scheduledDemos: scheduledDemos + rescheduledDemos,
    implementations,
  };
}

export default function DashboardPage() {
  const { data: session } = useSession();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  const kpis = [
    { label: 'Total Leads', value: stats?.totalLeads, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Quotations', value: stats?.activeQuotations, color: 'bg-amber-50 text-amber-700' },
    { label: 'Scheduled Demos', value: stats?.scheduledDemos, color: 'bg-purple-50 text-purple-700' },
    { label: 'Implementations', value: stats?.implementations, color: 'bg-green-50 text-green-700' },
  ];

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
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className={`text-3xl font-bold mt-2 ${kpi.color.split(' ')[1]}`}>
              {isLoading ? (
                <span className="inline-block h-8 w-12 bg-slate-100 rounded animate-pulse align-middle" />
              ) : (
                kpi.value ?? 0
              )}
            </p>
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
