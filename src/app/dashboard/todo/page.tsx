'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, PlusIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  MEETING_TYPES,
  MEETING_PRIORITIES,
  MEETING_STATUSES,
  MeetingType,
  MeetingPriority,
  MeetingStatus,
  isValidMeetingStatusTransition,
} from '@/lib/meetings/constants';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
};

async function fetchTodos(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/todo?${query}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

async function fetchUsers() {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content || [];
}

function AddTaskModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: users = [] } = useQuery({ queryKey: ['users-for-meetings'], queryFn: fetchUsers });

  const [form, setForm] = useState({
    title: '',
    meetingType: 'INTERNAL' as MeetingType,
    purpose: '',
    scheduledAt: '',
    durationMinutes: '',
    location: '',
    meetingLink: '',
    organizerId: '',
    priority: 'MEDIUM' as MeetingPriority,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          meetingType: form.meetingType,
          purpose: form.purpose || undefined,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
          location: form.location || undefined,
          meetingLink: form.meetingLink || undefined,
          organizerId: form.organizerId ? Number(form.organizerId) : undefined,
          priority: form.priority,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add task');
      }
      return res.json();
    },
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Task added');
      onClose();
      router.push(`/dashboard/todo/${meeting.id}`);
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Task</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Type</label>
              <select
                value={form.meetingType}
                onChange={(e) => setForm((f) => ({ ...f, meetingType: e.target.value as MeetingType }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {MEETING_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as MeetingPriority }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {MEETING_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Purpose</label>
            <textarea
              rows={3}
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Scheduled At</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Duration (min)</label>
              <input
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Conference room, address, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Meeting Link</label>
            <input
              value={form.meetingLink}
              onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
              placeholder="https://meet.google.com/..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Organizer</label>
            <select
              value={form.organizerId}
              onChange={(e) => setForm((f) => ({ ...f, organizerId: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Unassigned</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.title || !form.meetingType || !form.scheduledAt || createMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TodoListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has: hasPermission } = usePermissions();
  const canManageMeetings = hasPermission('manage_meetings');

  const [statusFilter, setStatusFilter] = useState('');
  const [meetingTypeFilter, setMeetingTypeFilter] = useState('');
  const [scheduledFrom, setScheduledFrom] = useState('');
  const [scheduledTo, setScheduledTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size) };
  if (statusFilter) params.status = statusFilter;
  if (search) params.search = search;
  if (meetingTypeFilter) params.meetingType = meetingTypeFilter;
  if (scheduledFrom) params.scheduledFrom = scheduledFrom;
  if (scheduledTo) params.scheduledTo = scheduledTo;

  const { data, isLoading } = useQuery({
    queryKey: ['meetings', params],
    queryFn: () => fetchTodos(params),
    placeholderData: (prev: any) => prev,
  });

  const meetings = data?.content || [];

  // Inline status/priority edits from the list — same PATCH the meeting
  // detail page's status/priority controls use, just triggered from the
  // table row instead of the detail page. CANCELLED is deliberately not
  // reachable here (see the options filter below) — cancelling goes
  // through the dedicated /cancel endpoint so the reason field and the
  // MEETING_CANCELLED notification fan-out still fire.
  const statusMutation = useMutation({
    mutationFn: async ({ id, version, status }: { id: number; version: number; status: MeetingStatus }) => {
      const res = await fetch(`/api/todo/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Status updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const priorityMutation = useMutation({
    mutationFn: async ({ id, version, priority }: { id: number; version: number; priority: MeetingPriority }) => {
      const res = await fetch(`/api/todo/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority, version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update priority');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Priority updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const allCount = Object.values(statusCounts).reduce((s, n) => s + (n || 0), 0);
  const totalPages = data?.totalPages || 0;
  const totalElements = data?.totalElements || 0;

  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
    if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
    return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
  };
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">To Do</h1>
          <p className="text-slate-500 mt-1">Track tasks and meetings across the team</p>
        </div>
        {canManageMeetings && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
          >
            <PlusIcon className="h-4 w-4" /> Add Task
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[{ v: '', l: 'All' }, ...MEETING_STATUSES.map((s) => ({ v: s, l: STATUS_LABELS[s] }))].map((s) => (
            <button
              key={s.v}
              onClick={() => { setStatusFilter(s.v); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s.v ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {s.l} <span className="opacity-70">({s.v ? statusCounts[s.v] ?? 0 : allCount})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="relative">
            <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tasks and meetings"
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-56"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
            <select
              value={meetingTypeFilter}
              onChange={(e) => { setMeetingTypeFilter(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All types</option>
              {MEETING_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={scheduledFrom}
              onChange={(e) => { setScheduledFrom(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={scheduledTo}
              onChange={(e) => { setScheduledTo(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          {(meetingTypeFilter || scheduledFrom || scheduledTo || search) && (
            <button
              onClick={() => { setMeetingTypeFilter(''); setScheduledFrom(''); setScheduledTo(''); setSearchInput(''); setSearch(''); setPage(0); }}
              className="text-sm text-slate-500 hover:text-red-500"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : meetings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16">
          <CalendarDaysIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-lg font-medium text-slate-600">No tasks or meetings</p>
          <p className="text-sm text-slate-400 mt-1">Add one to start tracking a task, or an internal, client, or vendor meeting</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Meeting</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Organizer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Scheduled At</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden xl:table-cell">Participants</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m: any, idx: number) => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/dashboard/todo/${m.id}`)}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors cursor-pointer`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/todo/${m.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-amber-600">
                        {m.title}
                      </Link>
                      {m.purpose && <p className="text-xs text-slate-500 truncate max-w-xs">{m.purpose}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{m.meetingType.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{m.organizerName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(m.scheduledAt).format('DD MMM YYYY, h:mm A')}</td>
                    <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{m.participantCount ?? 0}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canManageMeetings ? (
                        <select
                          value={m.priority}
                          disabled={priorityMutation.isPending && priorityMutation.variables?.id === m.id}
                          onChange={(e) =>
                            priorityMutation.mutate({ id: m.id, version: m.version, priority: e.target.value as MeetingPriority })
                          }
                          className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer disabled:opacity-50 ${PRIORITY_COLORS[m.priority] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {MEETING_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[m.priority] || 'bg-slate-100 text-slate-700'}`}>{m.priority}</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canManageMeetings ? (
                        <select
                          value={m.status}
                          disabled={statusMutation.isPending && statusMutation.variables?.id === m.id}
                          onChange={(e) =>
                            statusMutation.mutate({ id: m.id, version: m.version, status: e.target.value as MeetingStatus })
                          }
                          className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer disabled:opacity-50 ${STATUS_COLORS[m.status] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {(MEETING_STATUSES as readonly MeetingStatus[])
                            .filter((s) => s === m.status || (s !== 'CANCELLED' && isValidMeetingStatusTransition(m.status, s)))
                            .map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[m.status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[m.status] || m.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
        </div>
      )}

      {showCreateModal && <AddTaskModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
