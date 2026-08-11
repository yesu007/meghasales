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
import { leadStatusColor, leadStatusLabel } from '@/lib/leadStatus';

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

async function fetchLeadDetail(id: number): Promise<LeadDetail> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead');
  return res.json();
}

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
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  useEffect(() => {
    if (isError || stats?.hadFailure) toast.error('Some dashboard stats failed to load');
  }, [isError, stats?.hadFailure]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
          Welcome back, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Here&apos;s your CRM overview</p>
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

      {/* Lead Lookup */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Lead Lookup</h2>
          <p className="text-sm text-slate-500 mt-0.5">Find a lead to view its current status and full history of status changes and interactions.</p>
        </div>
        <div className="max-w-md">
          <LeadPickerCombobox value={selectedLead} onChange={setSelectedLead} />
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
                  <Link href={`/dashboard/leads/${leadDetail.id}`} className="flex items-center gap-1 min-h-[44px] text-sm text-amber-600 hover:text-amber-700 font-medium">
                    Full details <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  </Link>
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
                <ActivityTimeline leadId={leadDetail.id} />
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard/leads" className="flex items-center px-4 py-2 min-h-[44px] bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Manage Leads
          </a>
          <a href="/dashboard/quotations" className="flex items-center px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            Create Quotation
          </a>
          <a href="/dashboard/demos" className="flex items-center px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            Schedule Demo
          </a>
        </div>
      </div>
    </div>
  );
}
