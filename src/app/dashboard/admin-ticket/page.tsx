'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentCheckIcon, PlusIcon, MagnifyingGlassIcon, FunnelIcon, ListBulletIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { STATUSES, PRIORITIES, isValidStatusTransition, TicketStatus, Priority } from '@/lib/adminTicket/constants';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_BAR_COLOR: Record<string, string> = {
  OPEN: '#2563EB',
  IN_PROGRESS: '#D97706',
  PENDING: '#EA580C',
  COMPLETED: '#16A34A',
  CANCELLED: '#94A3B8',
};

// Not a measured completion percentage (this module has no sub-task
// checklist) — a fixed per-status stage marker, purely visual.
const STATUS_PROGRESS: Record<string, number> = {
  OPEN: 8,
  IN_PROGRESS: 50,
  PENDING: 75,
  COMPLETED: 100,
  CANCELLED: 100,
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
function avatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

interface AdvanceFilters {
  assignedToIds: number[];
  priorities: string[];
  categoryIds: number[];
  dueDateFrom: string;
  dueDateTo: string;
}
const EMPTY_FILTERS: AdvanceFilters = { assignedToIds: [], priorities: [], categoryIds: [], dueDateFrom: '', dueDateTo: '' };

async function fetchTickets(statusFilter: string, search: string, filters: AdvanceFilters) {
  const params = new URLSearchParams({ size: '100' });
  if (statusFilter) params.set('status', statusFilter);
  if (search) params.set('search', search);
  if (filters.assignedToIds.length) params.set('assignedToId', filters.assignedToIds.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  if (filters.categoryIds.length) params.set('categoryId', filters.categoryIds.join(','));
  if (filters.dueDateFrom) params.set('dueDateFrom', filters.dueDateFrom);
  if (filters.dueDateTo) params.set('dueDateTo', filters.dueDateTo);
  const res = await fetch(`/api/admin-ticket/tickets?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tickets');
  return res.json();
}

async function fetchCategories() {
  const res = await fetch('/api/admin-ticket/categories');
  if (!res.ok) return [];
  return res.json();
}

async function fetchUsers() {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content || [];
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ['admin-ticket-categories'], queryFn: fetchCategories });
  const { data: users = [] } = useQuery({ queryKey: ['users-for-admin-ticket'], queryFn: fetchUsers });

  const [form, setForm] = useState({
    categoryId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    dueDate: '',
    assignedToId: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin-ticket/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          assignedToId: form.assignedToId ? Number(form.assignedToId) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create ticket');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Ticket created');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">New Admin Ticket</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Select category</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Assign To</label>
            <select
              value={form.assignedToId}
              onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
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
            disabled={!form.categoryId || !form.title || createMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterSection = 'assignee' | 'priority' | 'category' | 'dueDate';
const FILTER_SECTIONS: { key: FilterSection; label: string }[] = [
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'dueDate', label: 'Due date' },
];

function AdvanceFilterModal({
  initial,
  categories,
  users,
  onClose,
  onApply,
}: {
  initial: AdvanceFilters;
  categories: any[];
  users: any[];
  onClose: () => void;
  onApply: (filters: AdvanceFilters) => void;
}) {
  const [section, setSection] = useState<FilterSection>('assignee');
  const [draft, setDraft] = useState<AdvanceFilters>(initial);

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Advance Filter</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex" style={{ height: 380 }}>
          <div className="w-44 border-r border-slate-100 py-2 shrink-0">
            {FILTER_SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium ${section === s.key ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {s.label}
                {s.key === 'assignee' && draft.assignedToIds.length > 0 && <span className="ml-1.5 text-xs text-slate-400">({draft.assignedToIds.length})</span>}
                {s.key === 'priority' && draft.priorities.length > 0 && <span className="ml-1.5 text-xs text-slate-400">({draft.priorities.length})</span>}
                {s.key === 'category' && draft.categoryIds.length > 0 && <span className="ml-1.5 text-xs text-slate-400">({draft.categoryIds.length})</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {section === 'assignee' && (
              <div className="space-y-1">
                {users.map((u: any) => (
                  <label key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.assignedToIds.includes(u.id)}
                      onChange={() => setDraft((d) => ({ ...d, assignedToIds: toggle(d.assignedToIds, u.id) }))}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: avatarColor(u.id) }}
                    >
                      {initials(`${u.firstName} ${u.lastName}`)}
                    </span>
                    <span className="text-sm text-slate-700">{u.firstName} {u.lastName}</span>
                  </label>
                ))}
              </div>
            )}
            {section === 'priority' && (
              <div className="space-y-1">
                {(PRIORITIES as readonly string[]).map((p) => (
                  <label key={p} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.priorities.includes(p)}
                      onChange={() => setDraft((d) => ({ ...d, priorities: d.priorities.includes(p) ? d.priorities.filter((x) => x !== p) : [...d.priorities, p] }))}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[p]}`}>{p}</span>
                  </label>
                ))}
              </div>
            )}
            {section === 'category' && (
              <div className="space-y-1">
                {categories.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.categoryIds.includes(c.id)}
                      onChange={() => setDraft((d) => ({ ...d, categoryIds: toggle(d.categoryIds, c.id) }))}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-700">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
            {section === 'dueDate' && (
              <div className="space-y-3 max-w-xs">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                  <input
                    type="date"
                    value={draft.dueDateFrom}
                    onChange={(e) => setDraft((d) => ({ ...d, dueDateFrom: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                  <input
                    type="date"
                    value={draft.dueDateTo}
                    onChange={(e) => setDraft((d) => ({ ...d, dueDateTo: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={() => setDraft(EMPTY_FILTERS)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg mr-auto">
            Clear all
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
            Close
          </button>
          <button onClick={() => onApply(draft)} className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: any }) {
  return (
    <Link href={`/dashboard/admin-ticket/${ticket.id}`} className="block bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{ticket.ticketNo}</p>
          <h3 className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{ticket.title}</h3>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1">{ticket.category?.name}</p>

      <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${STATUS_PROGRESS[ticket.status] ?? 0}%`, backgroundColor: STATUS_BAR_COLOR[ticket.status] || '#94A3B8' }}
        />
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Assigned to</p>
          <div className="flex items-center gap-1.5 mt-1">
            {ticket.assignedToId ? (
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                style={{ backgroundColor: avatarColor(ticket.assignedToId) }}
              >
                {initials(ticket.assignedToName || '?')}
              </span>
            ) : null}
            <span className="text-xs text-slate-600 truncate">{ticket.assignedToName || 'Unassigned'}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Deadline</p>
          <p className="text-xs text-slate-600 mt-1">{ticket.dueDate ? dayjs(ticket.dueDate).format('DD MMM YYYY') : '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-4 flex-wrap">
        <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[ticket.priority] || 'bg-slate-100 text-slate-700'}`}>{ticket.priority}</span>
        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[ticket.status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[ticket.status] || ticket.status}</span>
      </div>
    </Link>
  );
}

export default function AdminTicketListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [view, setView] = useState<'card' | 'list'>('card');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<AdvanceFilters>(EMPTY_FILTERS);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets', statusFilter, search, filters],
    queryFn: () => fetchTickets(statusFilter, search, filters),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['admin-ticket-categories'], queryFn: fetchCategories });
  const { data: users = [] } = useQuery({ queryKey: ['users-for-admin-ticket'], queryFn: fetchUsers });

  const tickets = data?.content || [];
  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const allCount = Object.values(statusCounts).reduce((s, n) => s + (n || 0), 0);
  const activeFilterCount = filters.assignedToIds.length + filters.priorities.length + filters.categoryIds.length + (filters.dueDateFrom ? 1 : 0) + (filters.dueDateTo ? 1 : 0);

  const patchMutation = useMutation({
    mutationFn: async ({ ticketId, version, patch }: { ticketId: number; version: number; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin-ticket/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update ticket');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Ticket updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Admin Tickets</h1>
          <p className="text-slate-500 mt-1">Office-admin obligations — compliance, renewals, facilities, and ad-hoc tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md ${view === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="List view"
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('card')}
              className={`p-1.5 rounded-md ${view === 'card' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Card view"
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
          >
            <PlusIcon className="h-4 w-4" /> New Ticket
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[
            { v: '', l: 'All' },
            { v: 'OPEN', l: 'Open' },
            { v: 'IN_PROGRESS', l: 'In Progress' },
            { v: 'PENDING', l: 'Pending' },
            { v: 'COMPLETED', l: 'Completed' },
            { v: 'CANCELLED', l: 'Cancelled' },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => setStatusFilter(s.v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s.v ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {s.l} <span className="opacity-70">({s.v ? statusCounts[s.v] ?? 0 : allCount})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tickets"
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-48"
            />
          </div>
          <button
            onClick={() => setShowFilterModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 bg-white"
          >
            <FunnelIcon className="h-4 w-4" /> Filter
            {activeFilterCount > 0 && <span className="bg-amber-600 text-white text-xs rounded-full px-1.5">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {isLoading ? (
        view === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-52 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        )
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16">
          <ClipboardDocumentCheckIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-lg font-medium text-slate-600">No admin tickets</p>
          <p className="text-sm text-slate-400 mt-1">Create one to start tracking a compliance deadline, renewal, or ad-hoc task</p>
        </div>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map((t: any) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Ticket</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Assigned To</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t: any) => {
                  const availableStatuses = (STATUSES as readonly TicketStatus[]).filter(
                    (s) => s === t.status || isValidStatusTransition(t.status, s)
                  );
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/admin-ticket/${t.id}`} className="font-medium text-slate-800 hover:text-amber-600">
                          {t.ticketNo}
                        </Link>
                        <p className="text-xs text-slate-500">{t.title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.category?.name}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{t.assignedToName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{t.dueDate ? dayjs(t.dueDate).format('DD MMM YYYY') : '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{dayjs(t.createdAt).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-3">
                        <select
                          value={t.priority}
                          disabled={patchMutation.isPending}
                          onChange={(e) => patchMutation.mutate({ ticketId: t.id, version: t.version, patch: { priority: e.target.value as Priority } })}
                          className={`px-2 py-1 rounded text-xs font-medium border-0 disabled:opacity-50 ${PRIORITY_COLORS[t.priority] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {(PRIORITIES as readonly Priority[]).map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={t.status}
                          disabled={patchMutation.isPending}
                          onChange={(e) => patchMutation.mutate({ ticketId: t.id, version: t.version, patch: { status: e.target.value as TicketStatus } })}
                          className={`px-2 py-1 rounded text-xs font-medium border-0 disabled:opacity-50 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {availableStatuses.map((s) => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewModal && <NewTicketModal onClose={() => setShowNewModal(false)} />}
      {showFilterModal && (
        <AdvanceFilterModal
          initial={filters}
          categories={categories}
          users={users}
          onClose={() => setShowFilterModal(false)}
          onApply={(next) => { setFilters(next); setShowFilterModal(false); }}
        />
      )}
    </div>
  );
}
