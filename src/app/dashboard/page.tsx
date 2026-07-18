'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

async function countFor(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const data = await res.json();
  return data.totalElements || 0;
}

async function fetchDashboardStats() {
  const results = await Promise.allSettled([
    countFor('/api/leads?size=1'),
    countFor('/api/quotations?status=DRAFT&size=1'),
    countFor('/api/quotations?status=SENT&size=1'),
    countFor('/api/demos?status=SCHEDULED&size=1'),
    countFor('/api/demos?status=RESCHEDULED&size=1'),
    countFor('/api/implementations?size=1'),
  ]);

  const value = (i: number) => (results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<number>).value : 0);
  const hadFailure = results.some((r) => r.status === 'rejected');

  return {
    totalLeads: value(0),
    activeQuotations: value(1) + value(2),
    scheduledDemos: value(3) + value(4),
    implementations: value(5),
    hadFailure,
  };
}

export default function DashboardPage() {
  const { data: session } = useSession();

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  useEffect(() => {
    if (isError || stats?.hadFailure) toast.error('Some dashboard stats failed to load');
  }, [isError, stats?.hadFailure]);

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
