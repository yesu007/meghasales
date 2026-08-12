'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, InboxIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface RunRow {
  id: number;
  payPeriodYear: number;
  payPeriodMonth: number;
  status: string;
  employeeCount: number;
  totalNetPay: number;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PROCESSED: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function fetchRuns(): Promise<RunRow[]> {
  const res = await fetch('/api/payroll/runs');
  if (!res.ok) throw new Error('Failed to fetch payroll runs');
  return res.json();
}

export default function PayrollRunsPage() {
  const queryClient = useQueryClient();
  const now = dayjs();
  const [year, setYear] = useState(now.year());
  const [month, setMonth] = useState(now.month() + 1);

  const { data: runs = [], isLoading } = useQuery({ queryKey: ['payroll-runs'], queryFn: fetchRuns });

  const createRun = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payPeriodYear: year, payPeriodMonth: month }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to generate run'); }
      return res.json();
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      toast.success(`Run generated — ${run.created} payslip(s), ${run.skipped} employee(s) skipped`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Payroll Runs</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Generate, review, and approve a month&apos;s payroll</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-700 mb-3">Generate a new run</p>
        <form onSubmit={(e) => { e.preventDefault(); createRun.mutate(); }} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
          </div>
          <button type="submit" disabled={createRun.isPending} className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
            <PlusIcon className="h-4 w-4" /> {createRun.isPending ? 'Generating...' : 'Generate Run'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : runs.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No payroll runs yet</p>
            <p className="text-sm text-slate-400 mt-1">Generate one above to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Employees</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Total Net Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/payroll/runs/${r.id}`} className="font-medium text-slate-800 hover:text-amber-700">{MONTH_NAMES[r.payPeriodMonth - 1]} {r.payPeriodYear}</Link>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-slate-600">{r.employeeCount}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">₹{r.totalNetPay.toLocaleString('en-IN')}</td>
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
