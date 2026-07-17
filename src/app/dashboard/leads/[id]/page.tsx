'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tab } from '@headlessui/react';
import { ArrowLeftIcon, UserGroupIcon, CalendarDaysIcon, ClockIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { LEAD_STATUSES, leadStatusColor } from '@/lib/leadStatus';
import EventsTab from '@/components/leads/EventsTab';
import ActivityTimeline from '@/components/leads/ActivityTimeline';
import LeadDocumentsTab from '@/components/leads/LeadDocumentsTab';

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string | null;
  mobile: string | null;
  status: string;
  leadSource: string;
  country: string | null;
  state: string | null;
  city: string | null;
  jewelleryBusinessType: string | null;
  numberOfBranches: number | null;
  existingErp: string | null;
  notes: string | null;
  createdAt: string;
  assignedBa: { firstName: string; lastName: string } | null;
}

async function fetchLead(id: string): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead');
  return res.json();
}

function classNames(...classes: (string | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as any)?.role;
  const permissions: string[] = (session?.user as any)?.permissions || [];
  const canManage = role === 'ADMIN' || permissions.includes('manage_lead_events');
  const canView = role === 'ADMIN' || permissions.includes('view_lead_events');
  const canAddDiscussion = canManage || permissions.includes('add_lead_discussion');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => fetchLead(id),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', Number(id)] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-16">
        <UserGroupIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Lead not found</p>
        <Link href="/dashboard/leads" className="text-amber-600 hover:text-amber-700 text-sm mt-2 inline-block">← Back to Leads</Link>
      </div>
    );
  }

  const isConfirmed = lead.status === 'CONFIRMED';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/leads" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{lead.companyName}</h1>
            <p className="text-slate-500 mt-1">{lead.contactPerson}{lead.email ? ` — ${lead.email}` : ''}</p>
          </div>
        </div>
        <select
          value={lead.status}
          disabled={statusMutation.isPending}
          onChange={(e) => statusMutation.mutate(e.target.value)}
          className={`self-start sm:self-auto px-3 py-1.5 rounded-full text-sm font-medium border-0 cursor-pointer disabled:opacity-60 ${leadStatusColor(lead.status)}`}
        >
          {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <Tab.Group>
        <Tab.List className="flex overflow-x-auto border-b border-slate-200">
          <Tab className={({ selected }) => classNames(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px',
            selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          )}>
            Overview
          </Tab>
          <Tab
            disabled={!isConfirmed}
            className={({ selected }) => classNames(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5',
              !isConfirmed ? 'border-transparent text-slate-300 cursor-not-allowed' : selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
            title={!isConfirmed ? 'Events unlock once this lead is Confirmed' : undefined}
          >
            <CalendarDaysIcon className="h-4 w-4" /> Events
          </Tab>
          <Tab
            disabled={!isConfirmed}
            className={({ selected }) => classNames(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5',
              !isConfirmed ? 'border-transparent text-slate-300 cursor-not-allowed' : selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
            title={!isConfirmed ? 'Documents unlock once this lead is Confirmed' : undefined}
          >
            <FolderOpenIcon className="h-4 w-4" /> Documents
          </Tab>
          <Tab className={({ selected }) => classNames(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5',
            selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          )}>
            <ClockIcon className="h-4 w-4" /> Activity
          </Tab>
        </Tab.List>
        <Tab.Panels className="mt-4">
          <Tab.Panel>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><p className="text-xs font-medium text-slate-500 uppercase">Mobile</p><p className="text-sm text-slate-800 mt-1">{lead.mobile || '—'}</p></div>
              <div><p className="text-xs font-medium text-slate-500 uppercase">Lead Source</p><p className="text-sm text-slate-800 mt-1 capitalize">{(lead.leadSource || '').replace(/_/g, ' ').toLowerCase() || '—'}</p></div>
              <div><p className="text-xs font-medium text-slate-500 uppercase">Assigned BA</p><p className="text-sm text-slate-800 mt-1">{lead.assignedBa ? `${lead.assignedBa.firstName} ${lead.assignedBa.lastName}` : 'Unassigned'}</p></div>
              <div><p className="text-xs font-medium text-slate-500 uppercase">Location</p><p className="text-sm text-slate-800 mt-1">{[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '—'}</p></div>
              <div><p className="text-xs font-medium text-slate-500 uppercase">Business Type</p><p className="text-sm text-slate-800 mt-1">{lead.jewelleryBusinessType || '—'}</p></div>
              <div><p className="text-xs font-medium text-slate-500 uppercase">Created</p><p className="text-sm text-slate-800 mt-1">{dayjs(lead.createdAt).format('DD MMM YYYY')}</p></div>
              {lead.notes && (
                <div className="sm:col-span-2"><p className="text-xs font-medium text-slate-500 uppercase">Notes</p><p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{lead.notes}</p></div>
              )}
            </div>
          </Tab.Panel>
          <Tab.Panel>
            {isConfirmed && canView ? (
              <EventsTab leadId={lead.id} canManage={canManage} canAddDiscussion={canAddDiscussion} />
            ) : (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <CalendarDaysIcon className="h-12 w-12 mx-auto text-slate-300" />
                <p className="mt-4 text-slate-600 font-medium">Events unlock once this lead is Confirmed</p>
              </div>
            )}
          </Tab.Panel>
          <Tab.Panel>
            {isConfirmed && canView ? (
              <LeadDocumentsTab leadId={lead.id} canManage={canManage} />
            ) : (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <FolderOpenIcon className="h-12 w-12 mx-auto text-slate-300" />
                <p className="mt-4 text-slate-600 font-medium">Documents unlock once this lead is Confirmed</p>
              </div>
            )}
          </Tab.Panel>
          <Tab.Panel>
            <ActivityTimeline leadId={lead.id} />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
