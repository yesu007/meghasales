'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tab } from '@headlessui/react';
import { ArrowLeftIcon, UserGroupIcon, CalendarDaysIcon, ClockIcon, FolderOpenIcon, DocumentTextIcon, BanknotesIcon, PhoneIcon, Squares2X2Icon, RectangleStackIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { useLeadStatusOptions } from '@/hooks/useLeadStatusOptions';
import { formatBusinessVerticals } from '@/lib/businessVerticals';
import EventsTab from '@/components/leads/EventsTab';
import ActivityTimeline from '@/components/leads/ActivityTimeline';
import FollowUpsTab from '@/components/leads/FollowUpsTab';
import CustomerKycCard from '@/components/customers/CustomerKycCard';
import CustomerContractsCard from '@/components/customers/CustomerContractsCard';
import LeadDocumentsTab from '@/components/leads/LeadDocumentsTab';
import InvoiceListPage from '@/components/accounting/InvoiceListPage';
import ProjectsTab from '@/components/leads/ProjectsTab';
import { invalidateLeadCustomerData } from '@/lib/queryInvalidation';

// A Customer is a Lead with status = CONFIRMED (see the module note atop
// src/app/dashboard/customers/page.tsx) — there is no separate Customer
// entity, so this page fetches the same /api/leads/:id record the Lead
// detail page does, and reuses its Events/Follow-up/Activity tab
// components verbatim (they're already generic over `leadId`). It mirrors
// src/app/dashboard/leads/[id]/page.tsx's header/tab structure as closely
// as possible; it always leaves Events/Documents unlocked (a customer is
// CONFIRMED by definition), rather than duplicating that logic — see
// EVENT/DOCUMENT tab lock condition below. Follow-up (like Activity) is
// never locked, matching the Lead detail page's own Follow-ups tab, which
// has no such gate either. Logging a follow-up here is safe for a
// Converted customer: suggestStatusAfterFollowUp() in src/lib/leadStatus.ts
// only ever moves a lead's status forward (by STATUS_RANK) and CONFIRMED
// already outranks every status a follow-up could suggest, so it can
// never downgrade a customer away from Converted.
//
// The Documents tab is Customer-specific rather than reused from the Lead
// detail page: it does NOT render the generic Lead Events document list
// (LeadDocumentsTab) — it's scoped to KYC and NDA/Contract only, as two
// inner tabs, not a general-purpose file repository. LeadDocumentsTab
// itself is untouched and still used as-is on the Lead detail page.
interface Customer {
  id: number;
  companyName: string;
  projectName: string | null;
  contactPerson: string;
  email: string | null;
  // Dedicated recipient for payment reminders — see schema.prisma's
  // Lead.financeEmail comment.
  financeEmail: string | null;
  mobile: string | null;
  status: string;
  leadSource: string;
  country: string | null;
  state: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  jewelleryBusinessType: string | null;
  numberOfBranches: number | null;
  existingErp: string | null;
  businessVerticals: string | null;
  notes: string | null;
  createdAt: string;
  // Conversion moment (Lead→Customer) — what "Customer Since" below
  // actually displays. See schema.prisma's Lead.confirmedAt comment. Falls
  // back to createdAt for any pre-existing row where it's somehow unset.
  confirmedAt: string | null;
  assignedBa: { firstName: string; lastName: string } | null;
}

async function fetchCustomer(id: string): Promise<Customer> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch customer');
  return res.json();
}

function classNames(...classes: (string | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}

// Tab order drives both the headless-ui Tab.Group index and the `?tab=`
// query param, so a refresh (or a shared link) lands back on the same tab —
// the Lead detail page doesn't need this (it's never deep-linked to a
// specific tab), but the Customer detail page is expected to preserve it.
const TAB_KEYS = ['overview', 'projects', 'events', 'documents', 'follow-up', 'activity', 'invoices', 'paid-invoices'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { options: leadStatusOptions, color: leadStatusColor } = useLeadStatusOptions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const roles = session?.user?.roles || [];
  const permissions = session?.user?.permissions || [];
  const canManage = roles.includes('ADMIN') || permissions.includes('manage_lead_events');
  const canView = roles.includes('ADMIN') || permissions.includes('view_lead_events');
  const canAddDiscussion = canManage || permissions.includes('add_lead_discussion');

  const tabParam = searchParams.get('tab') as TabKey | null;
  const selectedIndex = Math.max(0, TAB_KEYS.indexOf(tabParam ?? 'overview'));
  const setSelectedIndex = (index: number) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', TAB_KEYS[index]);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomer(id),
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load customer');
  }, [isError]);

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
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      invalidateLeadCustomerData(queryClient);
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

  if (!customer) {
    return (
      <div className="text-center py-16">
        <UserGroupIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Customer not found</p>
        <Link href="/dashboard/customers" className="text-amber-600 hover:text-amber-700 text-sm mt-2 inline-block">← Back to Customers</Link>
      </div>
    );
  }

  // Events/Documents unlock on CONFIRMED, same gate the Lead detail page
  // uses — normally always true here since this list is pre-filtered to
  // CONFIRMED, but stays accurate if the status is changed away from
  // Converted without leaving the page.
  const isConfirmed = customer.status === 'CONFIRMED';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/customers" className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-100 rounded-lg flex-shrink-0">
            <ArrowLeftIcon className="h-5 w-5 text-slate-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{customer.companyName}</h1>
            {customer.projectName && <p className="text-sm text-slate-500 mt-0.5 truncate">Project: {customer.projectName}</p>}
            <p className="text-slate-500 mt-1 text-sm sm:text-base truncate">{customer.contactPerson}{customer.email ? ` — ${customer.email}` : ''}</p>
          </div>
        </div>
        <select
          value={customer.status}
          disabled={statusMutation.isPending}
          onChange={(e) => statusMutation.mutate(e.target.value)}
          className={`self-start sm:self-auto px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-medium border-0 cursor-pointer disabled:opacity-60 ${leadStatusColor(customer.status)}`}
        >
          {leadStatusOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </div>

      {/* Vertical tabs: same Tab/Tab.Panel elements, styling, and behavior as
          before — only the orientation changed (flex-col sidebar instead of
          a horizontal row) so the active-tab indicator moves from a bottom
          border to a right border (the edge that touches the panel content,
          same relationship border-b-2/-mb-px had to the content below it in
          the horizontal layout). `vertical` on Tab.Group switches keyboard
          navigation to Up/Down to match, per Headless UI. */}
      {/* No items-start override here — the flex row's default `stretch`
          cross-axis alignment is what makes the sidebar's height (and its
          border-r divider) automatically track whichever is taller between
          itself and the active Tab.Panel, so it always matches the current
          tab's content height and both columns end at the same line. */}
      <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex} vertical>
        <div className="flex flex-col sm:flex-row gap-4">
          <Tab.List className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-x-visible border-b sm:border-b-0 sm:border-r border-slate-200 sm:w-48 sm:flex-shrink-0">
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <Squares2X2Icon className="h-4 w-4" /> Overview
            </Tab>
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <RectangleStackIcon className="h-4 w-4" /> Projects
            </Tab>
            <Tab
              disabled={!isConfirmed}
              className={({ selected }) => classNames(
                'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
                !isConfirmed ? 'border-transparent text-slate-300 cursor-not-allowed' : selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              title={!isConfirmed ? 'Events unlock once this customer is Confirmed' : undefined}
            >
              <CalendarDaysIcon className="h-4 w-4" /> Events
            </Tab>
            <Tab
              disabled={!isConfirmed}
              className={({ selected }) => classNames(
                'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
                !isConfirmed ? 'border-transparent text-slate-300 cursor-not-allowed' : selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              title={!isConfirmed ? 'Documents unlock once this customer is Confirmed' : undefined}
            >
              <FolderOpenIcon className="h-4 w-4" /> Documents
            </Tab>
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <PhoneIcon className="h-4 w-4" /> Follow-up
            </Tab>
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <ClockIcon className="h-4 w-4" /> Activity
            </Tab>
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <DocumentTextIcon className="h-4 w-4" /> Invoices
            </Tab>
            <Tab className={({ selected }) => classNames(
              'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 sm:border-b-0 sm:border-r-2 -mb-px sm:mb-0 sm:-mr-px flex items-center gap-1.5 focus:outline-none',
              selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}>
              <BanknotesIcon className="h-4 w-4" /> Paid Invoices
            </Tab>
          </Tab.List>
          <Tab.Panels className="flex-1 min-w-0">
            <Tab.Panel>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><p className="text-xs font-medium text-slate-500 uppercase">Mobile</p><p className="text-sm text-slate-800 mt-1">{customer.mobile || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Finance Email ID</p><p className="text-sm text-slate-800 mt-1">{customer.financeEmail || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Lead Source</p><p className="text-sm text-slate-800 mt-1 capitalize">{(customer.leadSource || '').replace(/_/g, ' ').toLowerCase() || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Assigned BA</p><p className="text-sm text-slate-800 mt-1">{customer.assignedBa ? `${customer.assignedBa.firstName} ${customer.assignedBa.lastName}` : 'Unassigned'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Location</p><p className="text-sm text-slate-800 mt-1">{[customer.addressLine1, customer.addressLine2, customer.city, customer.state, customer.country].filter(Boolean).join(', ') || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Business Type</p><p className="text-sm text-slate-800 mt-1">{customer.jewelleryBusinessType || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Business Vertical</p><p className="text-sm text-slate-800 mt-1">{formatBusinessVerticals(customer.businessVerticals) || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-500 uppercase">Customer Since</p><p className="text-sm text-slate-800 mt-1">{dayjs(customer.confirmedAt || customer.createdAt).format('DD MMM YYYY')}</p></div>
                {customer.notes && (
                  <div className="sm:col-span-2"><p className="text-xs font-medium text-slate-500 uppercase">Notes</p><p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{customer.notes}</p></div>
                )}
              </div>
            </Tab.Panel>
            <Tab.Panel>
              <ProjectsTab leadId={customer.id} />
            </Tab.Panel>
            <Tab.Panel>
              {isConfirmed && canView ? (
                <EventsTab leadId={customer.id} canManage={canManage} canAddDiscussion={canAddDiscussion} />
              ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                  <CalendarDaysIcon className="h-12 w-12 mx-auto text-slate-300" />
                  <p className="mt-4 text-slate-600 font-medium">Events unlock once this customer is Confirmed</p>
                </div>
              )}
            </Tab.Panel>
            <Tab.Panel>
              {isConfirmed && canView ? (
                <div className="space-y-6">
                  {/* KYC and NDA/Contract only — inner tabs, only one visible
                      at a time (KYC selected by default), same horizontal
                      Tab.List pattern as src/app/dashboard/leads/[id]/page.tsx.
                      The generic Lead Events document list (LeadDocumentsTab)
                      deliberately does NOT render here — Customer Documents
                      is scoped to KYC/NDA only, not a general file
                      repository. LeadDocumentsTab itself is untouched and
                      still used as-is by the Lead detail page. */}
                  <Tab.Group>
                    <Tab.List className="flex overflow-x-auto border-b border-slate-200">
                      <Tab className={({ selected }) => classNames(
                        'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 -mb-px',
                        selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                      )}>
                        KYC
                      </Tab>
                      <Tab className={({ selected }) => classNames(
                        'px-4 py-2.5 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 -mb-px',
                        selected ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                      )}>
                        NDA / Contract
                      </Tab>
                    </Tab.List>
                    <Tab.Panels className="mt-4">
                      <Tab.Panel>
                        <CustomerKycCard leadId={customer.id} canManage={canManage} />
                      </Tab.Panel>
                      <Tab.Panel>
                        <CustomerContractsCard leadId={customer.id} canManage={canManage} />
                      </Tab.Panel>
                    </Tab.Panels>
                  </Tab.Group>
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                  <FolderOpenIcon className="h-12 w-12 mx-auto text-slate-300" />
                  <p className="mt-4 text-slate-600 font-medium">Documents unlock once this customer is Confirmed</p>
                </div>
              )}
            </Tab.Panel>
            <Tab.Panel>
              <FollowUpsTab leadId={customer.id} />
            </Tab.Panel>
            <Tab.Panel>
              <ActivityTimeline leadId={customer.id} />
            </Tab.Panel>
            <Tab.Panel>
              {/* Same InvoiceListPage component/API/data as Accounting → Pending
                  Invoices (mode="open") — the leadId prop pins it to this
                  customer only; empty state falls out of the component
                  unchanged when there are none. */}
              <InvoiceListPage mode="open" leadId={customer.id} />
            </Tab.Panel>
            <Tab.Panel>
              {/* Same InvoiceListPage component/API/data as Accounting → Paid
                  Invoices (mode="paid"), pinned to this customer. */}
              <InvoiceListPage mode="paid" leadId={customer.id} />
            </Tab.Panel>
          </Tab.Panels>
        </div>
      </Tab.Group>
    </div>
  );
}
