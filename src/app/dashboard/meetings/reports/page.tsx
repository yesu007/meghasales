'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, DocumentChartBarIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { usePermissions } from '@/hooks/usePermissions';
import {
  MEETING_TYPES,
  ACTION_ITEM_PRIORITIES,
  ACTION_ITEM_STATUSES,
  ACTION_ITEM_SLA_STATUSES,
} from '@/lib/meetings/constants';

// Copied verbatim from src/app/dashboard/action-items/page.tsx for visual
// consistency — that file owns the canonical values, this is a duplicate.
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-cyan-100 text-cyan-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-orange-100 text-orange-700',
  BLOCKED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
  VERIFIED: 'bg-teal-100 text-teal-700',
  CLOSED: 'bg-slate-200 text-slate-600',
  CANCELLED: 'bg-slate-100 text-slate-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

// New for this report — SLA status is a computed-on-read value that has no
// existing badge elsewhere in the app, so this map isn't a copy of anything.
const SLA_STATUS_COLORS: Record<string, string> = {
  ON_TRACK: 'bg-slate-100 text-slate-600',
  DUE_SOON: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  ON_TIME: 'bg-green-100 text-green-700',
  BREACHED: 'bg-red-200 text-red-800',
  NOT_APPLICABLE: 'bg-slate-50 text-slate-400',
};

interface UserOption {
  id: number;
  fullName: string;
}

interface LeadOption {
  id: number;
  companyName: string;
}

interface ImplementationOption {
  id: number;
  projectName: string | null;
  companyName: string;
}

interface ActionItemReportRow {
  id: number;
  description: string;
  meetingId: number;
  meetingTitle: string;
  meetingType: string;
  assignedToId: number | null;
  assignedToName: string | null;
  department: string | null;
  priority: string;
  status: string;
  slaStatus: string;
  dueDate: string;
  completedAt: string | null;
  refType: string | null;
  refLabel: string | null;
}

interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  userId: string;
  department: string;
  leadId: string;
  implementationId: string;
  meetingType: string;
  priority: string;
  status: string;
  slaStatus: string;
}

const EMPTY_FILTERS: ReportFilters = {
  dateFrom: '',
  dateTo: '',
  userId: '',
  department: '',
  leadId: '',
  implementationId: '',
  meetingType: '',
  priority: '',
  status: '',
  slaStatus: '',
};

function buildParams(filters: ReportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  (Object.keys(filters) as Array<keyof ReportFilters>).forEach((key) => {
    if (filters[key]) params[key] = filters[key];
  });
  return params;
}

async function fetchReport(params: Record<string, string>): Promise<{ rows: ActionItemReportRow[]; truncated: boolean }> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/meetings/reports?${query}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

async function fetchLeads(): Promise<LeadOption[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch customers');
  const data = await res.json();
  return data.content;
}

async function fetchImplementations(): Promise<ImplementationOption[]> {
  const res = await fetch('/api/implementations?size=100');
  if (!res.ok) throw new Error('Failed to fetch projects');
  const data = await res.json();
  return data.content;
}

export default function MeetingReportsPage() {
  const { has } = usePermissions();
  const canExport = has('export_meeting_reports');
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const params = buildParams(filters);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['meeting-action-items-report', params],
    queryFn: () => fetchReport(params),
  });

  const { data: users = [] } = useQuery({ queryKey: ['meeting-report-users'], queryFn: fetchUsers });
  const { data: leads = [] } = useQuery({ queryKey: ['meeting-report-leads'], queryFn: fetchLeads });
  const { data: implementations = [] } = useQuery({ queryKey: ['meeting-report-implementations'], queryFn: fetchImplementations });

  const rows = data?.rows || [];
  const hasFilters = Object.values(filters).some(Boolean);

  const setFilter = (key: keyof ReportFilters) => (value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  const exportCsv = () => {
    const exportParams = new URLSearchParams({ ...params, format: 'csv' });
    window.open(`/api/meetings/reports?${exportParams.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meeting Action Item Reports</h1>
          <p className="text-slate-500 mt-1">Filter action items by date, owner, department, customer, project, and status</p>
        </div>
        {canExport && (
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            <ArrowDownTrayIcon className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Due From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Due To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilter('dateTo')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Assigned To</label>
            <select
              value={filters.userId}
              onChange={(e) => setFilter('userId')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
            <input
              type="text"
              value={filters.department}
              onChange={(e) => setFilter('department')(e.target.value)}
              placeholder="Department"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
            <select
              value={filters.leadId}
              onChange={(e) => setFilter('leadId')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All customers</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.companyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
            <select
              value={filters.implementationId}
              onChange={(e) => setFilter('implementationId')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All projects</option>
              {implementations.map((impl) => (
                <option key={impl.id} value={impl.id}>{impl.projectName || impl.companyName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Meeting Type</label>
            <select
              value={filters.meetingType}
              onChange={(e) => setFilter('meetingType')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All types</option>
              {MEETING_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilter('priority')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All priorities</option>
              {ACTION_ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter('status')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All statuses</option>
              {ACTION_ITEM_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">SLA Status</label>
            <select
              value={filters.slaStatus}
              onChange={(e) => setFilter('slaStatus')(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All SLA statuses</option>
              {ACTION_ITEM_SLA_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        {hasFilters && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-sm text-slate-500 hover:text-red-500 mt-3">
            Clear filters
          </button>
        )}
      </div>

      {data?.truncated && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2.5">
          Results truncated at 5,000 rows &mdash; narrow your filters to see the full set.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : isError ? (
          <p className="text-center py-16 text-sm text-red-600">Failed to load the report</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <DocumentChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No action items match these filters</p>
            <p className="text-sm text-slate-400 mt-1">Try widening the date range or clearing a filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Description</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Meeting</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Assigned To</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Department</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">SLA</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 text-slate-800 font-medium">{row.description}</td>
                    <td className="px-4 py-3 text-slate-600">{row.meetingTitle}</td>
                    <td className="px-4 py-3 text-slate-600">{row.assignedToName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[row.priority] || 'bg-slate-100 text-slate-700'}`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-700'}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${SLA_STATUS_COLORS[row.slaStatus] || 'bg-slate-100 text-slate-700'}`}>
                        {row.slaStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(row.dueDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-slate-600">{row.refLabel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
