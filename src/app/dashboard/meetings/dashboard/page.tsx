'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import dayjs from 'dayjs';
import {
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { ACTION_ITEM_STATUSES } from '@/lib/meetings/constants';

// Copied verbatim from src/app/dashboard/action-items/page.tsx so status
// colors read identically across the two screens — that file owns the
// canonical values, this is a duplicate, not a re-export.
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

const MOM_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  REJECTED: 'bg-red-100 text-red-700',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MeetingSummary {
  id: number;
  title: string;
  scheduledAt: string;
  meetingType: string;
}

interface PendingMom {
  id: number;
  meetingId: number;
  meetingTitle: string;
  status: string;
}

interface SlaApproachingItem {
  id: number;
  description: string;
  dueDate: string;
  priority: string;
  meetingTitle: string;
}

interface IndividualDashboard {
  meetingsToday: MeetingSummary[];
  pendingMoms: PendingMom[];
  actionItemsByStatus: Record<string, number>;
  dueTodayCount: number;
  overdueCount: number;
  slaApproaching: SlaApproachingItem[];
}

interface OwnerLoad {
  userId: number;
  name: string;
  openCount: number;
  overdueCount: number;
}

interface TeamDashboard {
  department: string;
  meetingLoadThisWeek: number;
  openActionsByOwner: OwnerLoad[];
  slaBreachTrend: Array<{ weekStart: string; breached: number }>;
  completionRatePercent: number;
  workloadHeatmap: Array<{ userId: number; name: string; day: string; openCount: number }>;
}

interface ManagementDashboard {
  totals: { meetings: number; openActions: number; slaCompliancePercent: number };
  departmentBreakdown: Array<{ department: string; openCount: number }>;
  customerBreakdown: Array<{ id: number; name: string; openCount: number }>;
  projectBreakdown: Array<{ id: number; name: string; openCount: number }>;
  meetingEffectivenessTrend: Array<{ weekStart: string; ratio: number }>;
}

interface DashboardResponse {
  individual: IndividualDashboard;
  team: TeamDashboard | null;
  management: ManagementDashboard | null;
}

async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch('/api/meetings/dashboard');
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function StatTile({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  href?: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const valueClass = tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-800';
  const card = (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full ${
        href ? 'hover:border-amber-300 transition-colors cursor-pointer' : ''
      }`}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function PanelCard({
  title,
  icon: Icon,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {isEmpty ? <p className="text-sm text-slate-400 py-6 text-center">{emptyLabel}</p> : children}
    </div>
  );
}

function ActionItemsStatusBar({ counts }: { counts: Record<string, number> }) {
  const total = ACTION_ITEM_STATUSES.reduce((sum, status) => sum + (counts[status] || 0), 0);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Your Action Items by Status</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No action items assigned to you</p>
      ) : (
        <>
          <div className="flex h-4 w-full rounded-full overflow-hidden bg-slate-100">
            {ACTION_ITEM_STATUSES.map((status) => {
              const count = counts[status] || 0;
              if (count === 0) return null;
              const bgClass = STATUS_COLORS[status]?.split(' ')[0] || 'bg-slate-300';
              return (
                <div
                  key={status}
                  title={`${status.replace('_', ' ')}: ${count}`}
                  className={`h-full ${bgClass} border-r-2 border-white last:border-r-0`}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {ACTION_ITEM_STATUSES.filter((status) => (counts[status] || 0) > 0).map((status) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]?.split(' ')[0] || 'bg-slate-300'}`} />
                {status.replace('_', ' ')} ({counts[status]})
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkloadHeatmap({ data }: { data: TeamDashboard['workloadHeatmap'] }) {
  if (data.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">No workload data for this week</p>;

  const owners: Array<{ userId: number; name: string }> = [];
  const seen = new Set<number>();
  for (const row of data) {
    if (!seen.has(row.userId)) {
      seen.add(row.userId);
      owners.push({ userId: row.userId, name: row.name });
    }
  }
  const lookup = new Map(data.map((row) => [`${row.userId}-${row.day}`, row.openCount]));
  const max = Math.max(1, ...data.map((row) => row.openCount));

  return (
    <div className="overflow-x-auto">
      <table className="text-sm" style={{ borderSpacing: '4px 4px', borderCollapse: 'separate' }}>
        <thead>
          <tr>
            <th className="text-left text-xs font-medium text-slate-500 pr-3" />
            {WEEKDAYS.map((day) => (
              <th key={day} className="text-xs font-medium text-slate-500 w-11">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {owners.map((owner) => (
            <tr key={owner.userId}>
              <td className="text-xs text-slate-600 pr-3 whitespace-nowrap">{owner.name}</td>
              {WEEKDAYS.map((day) => {
                const count = lookup.get(`${owner.userId}-${day}`) || 0;
                const opacity = count === 0 ? 0 : 0.18 + (count / max) * 0.72;
                return (
                  <td
                    key={day}
                    className={`w-11 h-8 rounded text-center text-xs font-medium ${count === 0 ? 'bg-slate-50' : ''}`}
                    style={count > 0 ? { backgroundColor: `rgba(217,119,6,${opacity})`, color: opacity > 0.5 ? '#fff' : '#78350F' } : undefined}
                  >
                    {count > 0 ? count : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MeetingsDashboardPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['meetings-dashboard'], queryFn: fetchDashboard });

  if (isLoading) {
    return (
      <div className="text-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-center py-24 text-sm text-red-600">Failed to load the meetings dashboard</p>;
  }

  const { individual, team, management } = data;
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Meetings Dashboard</h1>
        <p className="text-slate-500 mt-1">Your meetings, MOMs, and action items at a glance</p>
      </div>

      {/* My Dashboard — always shown for anyone with view_meetings */}
      <div className="space-y-4">
        <SectionHeading title="My Dashboard" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Meetings Today" value={individual.meetingsToday.length} />
          <StatTile label="Pending MOMs" value={individual.pendingMoms.length} />
          <StatTile
            label="Due Today"
            value={individual.dueTodayCount}
            href={`/dashboard/action-items?dueDateFrom=${today}&dueDateTo=${today}`}
            tone="warn"
          />
          <StatTile
            label="Overdue"
            value={individual.overdueCount}
            href={`/dashboard/action-items?dueDateTo=${yesterday}`}
            tone="danger"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelCard
            title="Today's Meetings"
            icon={CalendarDaysIcon}
            isEmpty={individual.meetingsToday.length === 0}
            emptyLabel="No meetings scheduled today"
          >
            <ul className="divide-y divide-slate-100">
              {individual.meetingsToday.map((m) => (
                <li key={m.id} className="py-2.5">
                  <Link href={`/dashboard/todo/${m.id}`} className="flex items-center justify-between gap-3 hover:text-amber-600">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{m.title}</span>
                      <span className="block text-xs text-slate-500">
                        {dayjs(m.scheduledAt).format('h:mm A')} &middot; {m.meetingType.replace('_', ' ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard
            title="Pending MOMs"
            icon={ClipboardDocumentCheckIcon}
            isEmpty={individual.pendingMoms.length === 0}
            emptyLabel="No MOMs waiting on you"
          >
            <ul className="divide-y divide-slate-100">
              {individual.pendingMoms.map((mom) => (
                <li key={mom.id} className="py-2.5">
                  <Link href={`/dashboard/todo/${mom.meetingId}`} className="flex items-center justify-between gap-3 hover:text-amber-600">
                    <span className="text-sm font-medium text-slate-800 truncate">{mom.meetingTitle}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${MOM_STATUS_COLORS[mom.status] || 'bg-slate-100 text-slate-600'}`}>
                      {mom.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </PanelCard>
        </div>

        <ActionItemsStatusBar counts={individual.actionItemsByStatus} />

        <PanelCard
          title="SLA Approaching"
          icon={ExclamationTriangleIcon}
          isEmpty={individual.slaApproaching.length === 0}
          emptyLabel="Nothing approaching its SLA deadline"
        >
          <ul className="divide-y divide-slate-100">
            {individual.slaApproaching.map((item) => (
              <li key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 truncate">{item.description}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {item.meetingTitle} &middot; due {dayjs(item.dueDate).format('DD MMM YYYY')}
                  </span>
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${PRIORITY_COLORS[item.priority] || 'bg-slate-100 text-slate-600'}`}>
                  {item.priority}
                </span>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>

      {/* Team Dashboard — only present with view_meeting_team_dashboard + a department set */}
      {team && (
        <div className="space-y-4">
          <SectionHeading title="Team Dashboard" subtitle={team.department} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Meetings This Week" value={team.meetingLoadThisWeek} />
            <StatTile label="Completion Rate" value={`${team.completionRatePercent}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <h3 className="text-sm font-semibold text-slate-700 px-5 pt-4 pb-2">Open Actions by Owner</h3>
              {team.openActionsByOwner.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No open action items in this department</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Owner</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-white">Open</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-white">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.openActionsByOwner.map((owner, idx) => (
                      <tr key={owner.userId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-2.5 text-slate-700">{owner.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{owner.openCount}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${owner.overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {owner.overdueCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">SLA Breach Trend (8 weeks)</h3>
              <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer>
                  <AreaChart
                    data={team.slaBreachTrend.map((w) => ({ week: dayjs(w.weekStart).format('DD MMM'), breached: w.breached }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
                    <Area type="monotone" dataKey="breached" stroke="#DC2626" fill="#DC2626" fillOpacity={0.15} strokeWidth={2} name="Breached" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Workload Heatmap (open action items, this week)</h3>
            <WorkloadHeatmap data={team.workloadHeatmap} />
          </div>
        </div>
      )}

      {/* Management Dashboard — only present with view_meeting_reports */}
      {management && (
        <div className="space-y-4">
          <SectionHeading title="Management Dashboard" />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatTile label="Meetings" value={management.totals.meetings} />
            <StatTile label="Open Actions" value={management.totals.openActions} />
            <StatTile label="SLA Compliance" value={`${management.totals.slaCompliancePercent}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ChartBarIcon className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Open Actions by Department</h3>
              </div>
              {management.departmentBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No department data</p>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={management.departmentBreakdown} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="department" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
                      <Bar dataKey="openCount" fill="#D97706" radius={[4, 4, 0, 0]} name="Open Actions" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Meeting Effectiveness Trend (12 weeks)</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={management.meetingEffectivenessTrend.map((w) => ({
                      week: dayjs(w.weekStart).format('DD MMM'),
                      pct: Math.round(w.ratio * 100),
                    }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={1} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={36} />
                    <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
                    <Line type="monotone" dataKey="pct" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} name="Effectiveness" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                <UserGroupIcon className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Open Actions by Customer</h3>
              </div>
              {management.customerBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No customer-linked action items open</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Customer</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-white">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {management.customerBreakdown.map((c, idx) => (
                      <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-2.5 text-slate-700">{c.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{c.openCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                <BuildingOffice2Icon className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Open Actions by Project</h3>
              </div>
              {management.projectBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No project-linked action items open</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Project</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-white">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {management.projectBreakdown.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-2.5 text-slate-700">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{p.openCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
