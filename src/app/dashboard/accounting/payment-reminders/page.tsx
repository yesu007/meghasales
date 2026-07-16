'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellAlertIcon, CheckCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

const REMINDER_LABELS: Record<string, string> = {
  UPCOMING_7D: 'Due in 7 Days',
  DUE_TODAY: 'Due Today',
  OVERDUE_3D: 'Overdue 3 Days',
  OVERDUE_7D: 'Overdue 7 Days',
  OVERDUE_15D: 'Overdue 15 Days',
  OVERDUE_30D: 'Overdue 30+ Days',
};

const REMINDER_COLORS: Record<string, string> = {
  UPCOMING_7D: 'bg-blue-100 text-blue-700',
  DUE_TODAY: 'bg-amber-100 text-amber-700',
  OVERDUE_3D: 'bg-orange-100 text-orange-700',
  OVERDUE_7D: 'bg-red-100 text-red-700',
  OVERDUE_15D: 'bg-red-100 text-red-700',
  OVERDUE_30D: 'bg-red-200 text-red-800',
};

function fmt(amount: string | number, currencyCode = 'INR'): string {
  return formatCurrency(amount, currencyCode);
}

async function fetchReminders(status: string) {
  const params = new URLSearchParams({ size: '50' });
  if (status) params.set('status', status);
  const res = await fetch(`/api/accounting/reminders?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch reminders');
  return res.json();
}

async function fetchTemplates() {
  const res = await fetch('/api/accounting/reminder-templates');
  if (!res.ok) return [];
  return res.json();
}

function RemindersTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['accounting-reminders', statusFilter],
    queryFn: () => fetchReminders(statusFilter),
  });

  const markFollowedUp = async (id: number) => {
    const res = await fetch(`/api/accounting/reminders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'FOLLOWED_UP' }),
    });
    if (!res.ok) { toast.error('Failed to update reminder'); return; }
    queryClient.invalidateQueries({ queryKey: ['accounting-reminders'] });
    toast.success('Marked as followed up');
  };

  const saveNotes = async (id: number) => {
    const notes = notesDraft[id];
    if (notes === undefined) return;
    const res = await fetch(`/api/accounting/reminders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) { toast.error('Failed to save notes'); return; }
    queryClient.invalidateQueries({ queryKey: ['accounting-reminders'] });
    toast.success('Notes saved');
  };

  const reminders = data?.content || [];

  return (
    <>
      <div className="flex gap-2 mb-4">
        {[{ v: 'PENDING', l: 'Pending' }, { v: 'FOLLOWED_UP', l: 'Followed Up' }, { v: '', l: 'All' }].map((s) => (
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
        ) : reminders.length === 0 ? (
          <div className="text-center py-16">
            <BellAlertIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No reminders here</p>
            <p className="text-sm text-slate-400 mt-1">Reminders appear automatically once an invoice crosses a due-date threshold</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Customer</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Outstanding</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Threshold</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Last Sent</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Next Reminder</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Notes</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reminders.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{r.companyName}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(r.balanceDue, r.currencyCode)}</td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{dayjs(r.dueDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${REMINDER_COLORS[r.reminderType] || 'bg-slate-100 text-slate-700'}`}>{REMINDER_LABELS[r.reminderType] || r.reminderType}</span></td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{dayjs(r.createdAt).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{r.nextReminderDate ? dayjs(r.nextReminderDate).format('DD MMM YYYY') : '—'}</td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <input
                        defaultValue={r.notes || ''}
                        onChange={(e) => setNotesDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                        onBlur={() => saveNotes(r.id)}
                        placeholder="Add note..."
                        className="w-32 px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'PENDING' ? (
                        <button onClick={() => markFollowedUp(r.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-700 hover:bg-green-50" title="Mark as Followed Up">
                          <CheckCircleIcon className="h-4 w-4" /> Follow Up
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-700 bg-green-50">
                          <CheckCircleIcon className="h-4 w-4" /> Followed Up
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ subject: '', body: '' });

  const { data: templates = [], isLoading } = useQuery({ queryKey: ['reminder-templates'], queryFn: fetchTemplates });

  const saveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/accounting/reminder-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('Failed to save template');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-templates'] });
      toast.success('Template saved');
      setEditingId(null);
    },
    onError: () => toast.error('Failed to save template'),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-3">
      {templates.map((t: any) => (
        <div key={t.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{t.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t.channel} · {t.reminderType.replace(/_/g, ' ')}</p>
            </div>
            {editingId !== t.id && (
              <button onClick={() => { setEditingId(t.id); setDraft({ subject: t.subject || '', body: t.body }); }} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          {editingId === t.id ? (
            <div className="mt-3 space-y-2">
              {t.channel === 'EMAIL' && (
                <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Subject" className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
              )}
              <textarea rows={3} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
                <button onClick={() => saveMutation.mutate(t.id)} className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">{t.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PaymentRemindersPage() {
  const [tab, setTab] = useState<'reminders' | 'templates'>('reminders');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payment Reminders</h1>
        <p className="text-slate-500 mt-1">Track overdue and upcoming payment reminders</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[{ v: 'reminders', l: 'Reminders' }, { v: 'templates', l: 'Templates' }].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.v ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'reminders' ? <RemindersTab /> : <TemplatesTab />}
    </div>
  );
}
