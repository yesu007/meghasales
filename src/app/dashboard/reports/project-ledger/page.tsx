'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, ArrowLeftIcon, DocumentChartBarIcon, PrinterIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { computeReportTotals } from '@/lib/reportTotals';
import { usePermissions } from '@/hooks/usePermissions';
import ReportTotalsFooter from '@/components/reports/ReportTotalsFooter';
import LedgerDetailModal, { LedgerDetailTarget } from '@/components/reports/LedgerDetailModal';

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[] }
interface ProjectOption { id: number; projectName: string }
interface VerticalOption { id: number; name: string }

const REPORT_TYPES = [
  { value: 'summary', label: 'Summary' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'transactions', label: 'Transactions' },
];

async function fetchReport(type: string, params: Record<string, string>): Promise<ReportResult> {
  const qs = new URLSearchParams({ type, ...params });
  const res = await fetch(`/api/reports/project-ledger?${qs.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}
async function fetchProjects(): Promise<ProjectOption[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}
async function fetchVerticals(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}

function fmtCell(value: any, type: string | undefined, currencyCode: string): string {
  // null is meaningfully different from 0 — "no budget set" must not read as
  // "the budget is zero", which would make Balance look like a real deficit.
  if (value === null || value === undefined) return '—';
  if (type === 'currency' && typeof value === 'number') return formatCurrency(value, currencyCode);
  if (type === 'number' && typeof value === 'number') return value.toLocaleString('en-IN');
  return String(value);
}


// Last day of a YYYY-MM month, as a local date string.
//
// NOT via toISOString(): that converts to UTC first, so in any timezone east
// of Greenwich the local month-end midnight lands on the previous day —
// 30 Sep became 29 Sep in IST, silently dropping the last day of every month
// from monthly drill-throughs.
function monthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The drill-through must land on EXACTLY the rows behind the figure clicked —
// otherwise a Debit of ₹1,07,500 opens a list totalling something else, and
// the reader stops trusting both screens. So the link carries whatever
// narrowed that cell: the row's project (Summary), the row's month
// (Monthly), and any filter currently applied to the page.
function debitDrillHref(
  row: Record<string, any>,
  opts: { projectId: string; verticalId: string; from: string; to: string }
): string {
  const qs = new URLSearchParams({ type: 'detail' });

  const rowProject = row._projectId ? String(row._projectId) : '';
  const project = rowProject || opts.projectId;
  if (project) qs.set('projectId', project);
  // With no single project in play, the ledger counted only project-tagged
  // spend, so the detail list must exclude Overall expenses too.
  else qs.set('projectOnly', 'true');

  if (opts.verticalId) qs.set('verticalId', opts.verticalId);

  // A Transactions row is one entry on one day, so it scopes to that day.
  // A Monthly row scopes to its own month. Either overrides the page's wider
  // date filter, because the figure clicked was itself narrower.
  if (typeof row._day === 'string') {
    qs.set('from', row._day);
    qs.set('to', row._day);
  } else if (typeof row.period === 'string' && /^\d{4}-\d{2}$/.test(row.period)) {
    qs.set('from', `${row.period}-01`);
    qs.set('to', monthEnd(row.period));
  } else {
    if (opts.from) qs.set('from', opts.from);
    if (opts.to) qs.set('to', opts.to);
  }

  return `/dashboard/reports/expenses?${qs.toString()}`;
}


// Turns the clicked cell into a popup scope. The period comes from the row
// itself when the row is narrower than the page filter: a Transactions row
// is one day, a Monthly row is one month.
function detailTargetFor(
  row: Record<string, any>,
  colKey: 'billed' | 'credit' | 'debit',
  opts: { projectId: string; verticalId: string; from: string; to: string }
): LedgerDetailTarget {
  let from = opts.from || undefined;
  let to = opts.to || undefined;
  if (typeof row._day === 'string') {
    from = row._day; to = row._day;
  } else if (typeof row.period === 'string' && /^\d{4}-\d{2}$/.test(row.period)) {
    from = `${row.period}-01`;
    to = monthEnd(row.period);
  }

  const rowProject = row._projectId ? Number(row._projectId) : undefined;
  const project = rowProject ?? (opts.projectId ? Number(opts.projectId) : undefined);

  const title = String(row.project ?? row.period ?? row.reference ?? 'Selection');

  return {
    mode: colKey === 'debit' ? 'expense' : 'income',
    title,
    currencyCode: String(row.currencyCode || 'INR'),
    projectId: project,
    from,
    to,
    projectOnly: !project,
    expenseHref: colKey === 'debit' ? debitDrillHref(row, opts) : undefined,
  };
}


// The PDF's totals row is built from the same computeReportTotals() the
// on-screen footer uses, so the exported figure always equals the displayed
// one. One row per currency, laid out in the report's own column order.
function buildPdfFoot(report: { columns: { key: string; label: string; type?: string }[]; rows: Record<string, any>[] }): string[][] {
  const totals = computeReportTotals(report.columns as any, report.rows);
  if (totals.length === 0) return [];
  const multi = totals.length > 1;
  return totals.map((t) =>
    report.columns.map((col, i) => {
      if (i === 0) return multi ? `Total · ${t.currencyCode}` : 'Total';
      const v = t.values[col.key];
      if (v === undefined) return '';
      return col.type === 'currency' ? formatCurrency(v, t.currencyCode) : v.toLocaleString('en-IN');
    })
  );
}

export default function ProjectLedgerPage() {
  const { has } = usePermissions();
  const canExport = has('view_accounting') || has('view_projects');
  const [type, setType] = useState('summary');
  const [projectId, setProjectId] = useState('');
  const [verticalId, setVerticalId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Which row's income detail is open. Debit drills through to a filtered
  // Expense Report page; income opens here instead, because an invoice and
  // its payments are a small, self-contained set best read without losing
  // your place in the ledger.
  const [detail, setDetail] = useState<LedgerDetailTarget | null>(null);

  const params: Record<string, string> = {};
  if (projectId) params.projectId = projectId;
  if (verticalId) params.verticalId = verticalId;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['project-ledger', type, params],
    queryFn: () => fetchReport(type, params),
  });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-for-ledger'], queryFn: fetchProjects });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals-for-project-ledger'], queryFn: fetchVerticals });

  useEffect(() => { if (isError) toast.error('Failed to load ledger'); }, [isError]);

  const exportPdf = () => {
    if (!report) return;
    generateReportPDF(report.title, report.columns, report.rows, `project-ledger-${type}-${new Date().toISOString().slice(0, 10)}.pdf`, buildPdfFoot(report));
  };

  const noCredit = report?.rows.length ? report.rows.every((r) => !Number(r.credit) && !Number(r.billed)) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-600 mb-1">
            <ArrowLeftIcon className="h-4 w-4" /> Reports
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Project Ledger</h1>
            <p className="text-slate-500 text-xs">Credit and debit per project — what comes in and what goes out</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            <PrinterIcon className="h-4 w-4" /> Print
          </button>
          {canExport && (
            <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              <ArrowDownTrayIcon className="h-4 w-4" /> PDF
            </button>
          )}
        </div>
      </div>

      {noCredit && (
        <p className="text-xs text-slate-500 -mt-3">
          Credit reads zero because no quotation has a Project set yet — set one on the Quotation form and it starts reporting.
        </p>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORT_TYPES.map((t) => (
          <button key={t.value} onClick={() => setType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t.value ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center print:hidden">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
        </select>
        <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Verticals</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        {(projectId || verticalId || from || to) && (
          <button onClick={() => { setProjectId(''); setVerticalId(''); setFrom(''); setTo(''); }} className="text-sm text-slate-500 hover:text-red-500">Clear</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : !report || report.rows.length === 0 ? (
          <div className="text-center py-16">
            <DocumentChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No entries for this ledger</p>
            <p className="text-sm text-slate-400 mt-1">Try a wider date range or a different project</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {report.columns.map((col) => (
                    <th key={col.key} className={`px-4 py-3 font-semibold text-slate-600 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, idx) => (
                  <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors border-b border-slate-100 last:border-0`}>
                    {report.columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>
                        {['billed', 'credit', 'debit'].includes(col.key) && Number(row[col.key]) > 0 ? (
                          // Every money figure opens the records behind it —
                          // a total a reader cannot open is one they cannot
                          // check.
                          <button
                            type="button"
                            onClick={() => setDetail(detailTargetFor(row, col.key as 'billed' | 'credit' | 'debit', { projectId, verticalId, from, to }))}
                            className="text-amber-700 hover:text-amber-900 underline decoration-amber-300 underline-offset-2"
                          >
                            {fmtCell(row[col.key], col.type, String(row.currencyCode || 'INR'))}
                          </button>
                        ) : fmtCell(row[col.key], col.type, String(row.currencyCode || 'INR'))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <ReportTotalsFooter columns={report.columns} rows={report.rows} />
            </table>
          </div>
        )}
      </div>

      {detail && <LedgerDetailModal target={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
