'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '@/hooks/usePermissions';

type ReportType = 'salary-register' | 'department-cost' | 'ytd-earnings' | 'pf-contribution' | 'esi-contribution' | 'pt-summary';

const REPORT_LABELS: Record<ReportType, string> = {
  'salary-register': 'Salary Register (one run)',
  'department-cost': 'Department Cost Summary',
  'ytd-earnings': 'YTD Earnings per Employee',
  'pf-contribution': 'PF Contribution Statement (one run)',
  'esi-contribution': 'ESI Contribution Statement (one run)',
  'pt-summary': 'Professional Tax Summary (one run)',
};

// Everything except the two calendar-aggregation reports is scoped to a
// single run, since that's what a statutory filing is actually for — one
// month's remittance, not a running total.
const RUN_SCOPED: ReportType[] = ['salary-register', 'pf-contribution', 'esi-contribution', 'pt-summary'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[] }
interface RunOption { id: number; payPeriodYear: number; payPeriodMonth: number; status: string }

async function fetchRuns(): Promise<RunOption[]> {
  const res = await fetch('/api/payroll/runs');
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}

function formatCell(value: any, type?: string): string {
  if (type === 'currency') return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(value);
}

export default function PayrollReportsPage() {
  const { has } = usePermissions();
  const canExport = has('export_payroll');
  const [type, setType] = useState<ReportType>('salary-register');
  const [runId, setRunId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: runs = [] } = useQuery({ queryKey: ['payroll-runs'], queryFn: fetchRuns });

  const buildQuery = () => {
    const params = new URLSearchParams({ type });
    if (RUN_SCOPED.includes(type)) { if (runId) params.set('runId', runId); }
    else { params.set('year', year); if (month) params.set('month', month); }
    return params.toString();
  };

  const viewReport = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/reports?${buildQuery()}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to load report'); }
      setReport(await res.json());
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Payroll Reports</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Salary register, department cost, and YTD earnings</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Report</label>
            <select value={type} onChange={(e) => { setType(e.target.value as ReportType); setReport(null); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
              {Object.entries(REPORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {RUN_SCOPED.includes(type) ? (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Payroll Run</label>
              <select value={runId} onChange={(e) => setRunId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                <option value="">Select a run</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{MONTH_NAMES[r.payPeriodMonth - 1]} {r.payPeriodYear} ({r.status})</option>)}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Year</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
              </div>
              {type === 'department-cost' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Month (optional)</label>
                  <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                    <option value="">Whole year</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <button onClick={viewReport} disabled={loading || (RUN_SCOPED.includes(type) && !runId)} className="px-4 py-2 min-h-[40px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'View Report'}
          </button>

          {report && canExport && (
            <a href={`/api/payroll/reports/export?${buildQuery()}`} className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
              <ArrowDownTrayIcon className="h-4 w-4" /> Export CSV
            </a>
          )}
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {report && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200"><h2 className="font-semibold text-slate-800">{report.title}</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c.key} className={`px-4 py-2.5 font-semibold text-slate-700 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.length === 0 ? (
                  <tr><td colSpan={report.columns.length} className="px-4 py-8 text-center text-slate-400">No data for this selection</td></tr>
                ) : report.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {report.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2 text-slate-700 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{formatCell(row[c.key], c.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
