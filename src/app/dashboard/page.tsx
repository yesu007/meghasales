'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Link from 'next/link';
import dayjs from 'dayjs';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import LeadPickerCombobox, { type LeadOption } from '@/components/leads/LeadPickerCombobox';
import ActivityTimeline from '@/components/leads/ActivityTimeline';
import { useLeadStatusOptions } from '@/hooks/useLeadStatusOptions';
import { usePermissions } from '@/hooks/usePermissions';

interface LeadDetail {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string | null;
  mobile: string | null;
  status: string;
  leadSource: string;
  createdAt: string;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  assignedBa: { firstName: string; lastName: string } | null;
}

// All Dashboard data comes from /api/dashboard/*, gated by view_dashboard
// alone — not the Leads/Quotations/Demos/Implementations APIs, which need
// their own view_* permissions and left roles without them with zeros and
// "failed to load" toasts.
async function fetchLeadDetail(id: number): Promise<LeadDetail> {
  const res = await fetch(`/api/dashboard/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead');
  return res.json();
}

async function fetchDashboardStats(): Promise<{ totalLeads: number; activeQuotations: number; scheduledDemos: number; implementations: number }> {
  const res = await fetch('/api/dashboard/stats');
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const { label: leadStatusLabel, color: leadStatusColor } = useLeadStatusOptions();
  // Gated by view_dashboard (Roles screen). Without it the layout redirects
  // to the first page the user's nav offers; nothing is fetched meanwhile.
  const { has } = usePermissions();
  const canViewDashboard = has('view_dashboard');
  // Links out of the Dashboard only appear when the target page would
  // actually open for this user.
  const quickActions = [
    { href: '/dashboard/leads', label: 'Manage Leads', permission: 'view_leads', className: 'bg-blue-600 hover:bg-blue-700' },
    { href: '/dashboard/quotations', label: 'Create Quotation', permission: 'view_quotations', className: 'bg-amber-600 hover:bg-amber-700' },
    { href: '/dashboard/demos', label: 'Schedule Demo', permission: 'view_demos', className: 'bg-purple-600 hover:bg-purple-700' },
  ].filter((a) => has(a.permission));

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    enabled: canViewDashboard,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load dashboard stats');
  }, [isError]);

  const { data: leadDetail, isLoading: isLeadLoading, isError: isLeadError } = useQuery({
    queryKey: ['lead', String(selectedLead?.id)],
    queryFn: () => fetchLeadDetail(selectedLead!.id),
    enabled: !!selectedLead,
  });

  useEffect(() => {
    if (isLeadError) toast.error('Failed to load lead details');
  }, [isLeadError]);

  const kpis = [
    { label: 'Total Leads', value: stats?.totalLeads, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Quotations', value: stats?.activeQuotations, color: 'bg-amber-50 text-amber-700' },
    { label: 'Scheduled Demos', value: stats?.scheduledDemos, color: 'bg-purple-50 text-purple-700' },
    { label: 'Implementations', value: stats?.implementations, color: 'bg-green-50 text-green-700' },
  ];

  if (!canViewDashboard) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16 px-4">
        <p className="text-lg font-medium text-slate-600">Welcome, {session?.user?.name?.split(' ')[0]}</p>
        <p className="text-sm text-slate-400 mt-1">You don&apos;t have access to the Dashboard. Contact an administrator if you need it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-800">
          Welcome back, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-0.5 text-sm">Here&apos;s your CRM overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">{kpi.label}</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${kpi.color.split(' ')[1]}`}>
              {isLoading ? (
                <span className="inline-block h-6 w-10 bg-slate-100 rounded animate-pulse align-middle" />
              ) : (
                kpi.value ?? 0
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Lead Lookup */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-800">Lead Lookup</h2>
          <p className="text-sm text-slate-500 mt-0.5">Find a lead to view its current status and full history of status changes and interactions.</p>
        </div>
        <div className="max-w-md">
          <LeadPickerCombobox value={selectedLead} onChange={setSelectedLead} searchUrl="/api/dashboard/leads" />
        </div>

        {selectedLead && (
          isLeadLoading ? (
            <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
          ) : leadDetail ? (
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">{leadDetail.companyName}</h3>
                  <p className="text-sm text-slate-500">{leadDetail.contactPerson}{leadDetail.email ? ` — ${leadDetail.email}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1.5 min-h-[36px] inline-flex items-center rounded-full text-sm font-medium ${leadStatusColor(leadDetail.status)}`}>
                    {leadStatusLabel(leadDetail.status)}
                  </span>
                  {has('view_leads') && (
                    <Link href={`/dashboard/leads/${leadDetail.id}`} className="flex items-center gap-1 min-h-[44px] text-sm text-amber-600 hover:text-amber-700 font-medium">
                      Full details <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div><p className="text-xs font-medium text-slate-500 uppercase">Lead Source</p><p className="text-slate-800 mt-0.5 capitalize">{(leadDetail.leadSource || '').replace(/_/g, ' ').toLowerCase() || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Assigned Owner</p><p className="text-slate-800 mt-0.5">{leadDetail.assignedBa ? `${leadDetail.assignedBa.firstName} ${leadDetail.assignedBa.lastName}` : 'Unassigned'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Created</p><p className="text-slate-800 mt-0.5">{dayjs(leadDetail.createdAt).format('DD MMM YYYY')}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Last Follow-up</p><p className="text-slate-800 mt-0.5">{leadDetail.lastFollowUpDate ? dayjs(leadDetail.lastFollowUpDate).format('DD MMM YYYY') : '—'}</p></div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Status &amp; Interaction History</h4>
                <ActivityTimeline leadId={leadDetail.id} activitiesUrl={`/api/dashboard/leads/${leadDetail.id}/activities`} />
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {quickActions.map((a) => (
              <a key={a.href} href={a.href} className={`flex items-center px-4 py-2 min-h-[44px] text-white rounded-lg text-sm font-medium ${a.className}`}>
                {a.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
