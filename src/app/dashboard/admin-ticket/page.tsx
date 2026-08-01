'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentCheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

async function fetchTickets(status: string) {
  const params = new URLSearchParams({ size: '50' });
  if (status) params.set('status', status);
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

export default function AdminTicketListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets', statusFilter],
    queryFn: () => fetchTickets(statusFilter),
  });

  const tickets = data?.content || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Admin Tickets</h1>
          <p className="text-slate-500 mt-1">Office-admin obligations — compliance, renewals, facilities, and ad-hoc tasks</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Ticket
        </button>
      </div>

      <div className="flex gap-2">
        {[{ v: '', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'IN_PROGRESS', l: 'In Progress' }, { v: 'PENDING', l: 'Pending' }, { v: 'COMPLETED', l: 'Completed' }, { v: 'CANCELLED', l: 'Cancelled' }].map((s) => (
          <button
            key={s.v}
            onClick={() => setStatusFilter(s.v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s.v ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {s.l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardDocumentCheckIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No admin tickets</p>
            <p className="text-sm text-slate-400 mt-1">Create one to start tracking a compliance deadline, renewal, or ad-hoc task</p>
          </div>
        ) : (
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
                {tickets.map((t: any) => (
                  <tr key={t.id} className="hover:bg-slate-50 cursor-pointer">
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
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[t.priority] || 'bg-slate-100 text-slate-700'}`}>{t.priority}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-700'}`}>{t.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewModal && <NewTicketModal onClose={() => setShowNewModal(false)} />}
    </div>
  );
}
