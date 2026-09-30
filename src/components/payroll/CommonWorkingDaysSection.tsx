'use client';

// Time & Attendance → Settings → Common Working Saturdays. A Saturday both
// teams work: it pauses the Team A / Team B rotation — the team whose turn
// it was gets the next Saturday instead, and the alternation continues
// from there (see teamWeekOff.ts). Removing one restores the rotation.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { BriefcaseIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { notifyAttendanceScheduleChanged } from '@/lib/payroll/attendanceScheduleSync';
import { describeCommonWorkingDays, isSaturday, teamLabel, WEEK_OFF_TEAMS } from '@/lib/payroll/teamWeekOff';

interface CommonWorkingDayRow { id: number; date: string; team: string; teamLabel: string | null; carryForwardDate: string; note: string | null }
interface Response { teamStartDate: string | null; days: CommonWorkingDayRow[] }

async function fetchDays(): Promise<Response> {
  const res = await fetch('/api/payroll/common-working-days');
  if (!res.ok) throw new Error('Failed to fetch common working days');
  return res.json();
}

const inputCls = 'px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

export default function CommonWorkingDaysSection({ canCreate, canDelete, standalone = false }: { canCreate: boolean; canDelete: boolean; standalone?: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ date: '', note: '' });
  const { data } = useQuery({ queryKey: ['common-working-days'], queryFn: fetchDays });
  const days = data?.days || [];
  const teamStart = data?.teamStartDate ?? null;
  // Week-offs change everywhere — this tab, other open tabs, Regular Days on the Timesheet.
  const refresh = () => notifyAttendanceScheduleChanged(queryClient);

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/common-working-days', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to add'); }
      return res.json();
    },
    onSuccess: (r: { team: string; carryForwardDate: string }) => {
      refresh();
      setForm({ date: '', note: '' });
      toast.success(`Added — ${teamLabel(r.team)}'s week off moves to ${dayjs(r.carryForwardDate).format('DD MMM YYYY')}; the rotation continues from there`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/common-working-days/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to remove'); }
      return res.json();
    },
    onSuccess: () => { refresh(); toast.success('Removed — original week off restored'); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Whose turn the chosen Saturday is (and where it carries to), shown before saving.
  const preview = form.date && isSaturday(form.date) && teamStart && form.date >= teamStart && !days.some((d) => d.date === form.date)
    ? describeCommonWorkingDays({ saturdayPolicy: 'NONE', teamStartDate: teamStart, commonWorkingDays: [...days.map((d) => ({ date: d.date })), { date: form.date }] }).find((d) => d.date === form.date)
    : null;
  const hint = form.date
    ? !isSaturday(form.date) ? 'Choose a Saturday.'
      : preview ? `It's ${teamLabel(preview.team)}'s turn — both teams will work; ${teamLabel(preview.team)} gets ${dayjs(preview.carryForwardDate).format('ddd, DD MMM YYYY')} off instead, and the alternation continues from there.`
        : null
    : null;

  return (
    <div className={standalone ? 'space-y-3' : 'space-y-3 pt-5 border-t border-slate-100'}>
      {/* Its own dialog supplies the heading when standalone. */}
      {!standalone && (
        <div className="flex items-center gap-2">
          <BriefcaseIcon className="h-5 w-5 text-amber-600" />
          <h4 className="text-sm font-semibold text-slate-800">Common Working Saturdays</h4>
        </div>
      )}
      {!teamStart ? (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          Team A / Team B alternate Saturdays aren&apos;t set up yet — set &quot;Team A&apos;s first week-off Saturday&quot; in Payroll → Statutory Settings first.
        </p>
      ) : (
        <p className="text-sm text-slate-500 bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
          Mark a Saturday as a working day for both teams. The team whose turn it was gets the next Saturday off instead, and the alternation continues from there.
        </p>
      )}

      {canCreate && teamStart && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!form.date) { toast.error('Choose the Saturday'); return; } add.mutate(); }}
          className="space-y-2"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Common working Saturday
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={`sm:w-44 ${inputCls}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 flex-1">
              Note
              <input placeholder="e.g. Client release" value={form.note} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputCls} />
            </label>
            <button type="submit" disabled={add.isPending} className="self-end flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50"><PlusIcon className="h-4 w-4" /> Add</button>
          </div>
          {hint && <p className={`text-xs ${isSaturday(form.date) ? 'text-slate-500' : 'text-red-500'}`}>{hint}</p>}
        </form>
      )}

      <div className="space-y-1.5">
        {days.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No Common Working Saturdays</p>
        ) : (
          days.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-lg bg-amber-50 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                  <span className="text-[10px] font-medium text-amber-500 uppercase">{dayjs(d.date).format('MMM')}</span>
                  <span className="text-sm font-bold text-amber-700">{dayjs(d.date).format('DD')}</span>
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{dayjs(d.date).format('dddd, DD MMM YYYY')} — both teams work</p>
                  <p className="text-xs text-slate-400">
                    {WEEK_OFF_TEAMS.map((t) => (t.value === d.team
                      ? `${t.label}: carry-forward Yes → ${dayjs(d.carryForwardDate).format('ddd, DD MMM YYYY')}`
                      : `${t.label}: carry-forward No`)).join(' · ')}
                    {' · rotation shifts one week from here'}
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </div>
              </div>
              {canDelete && (
                <button onClick={() => { if (window.confirm(`Remove the Common Working Saturday on ${dayjs(d.date).format('DD MMM YYYY')}? ${d.teamLabel}'s week off goes back to that Saturday.`)) remove.mutate(d.id); }} className="p-2 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="h-4 w-4" /></button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
