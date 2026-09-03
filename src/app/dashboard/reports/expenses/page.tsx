'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, ArrowLeftIcon, DocumentChartBarIcon, PrinterIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { computeReportTotals } from '@/lib/reportTotals';
import { usePermissions } from '@/hooks/usePermissions';
import ReportTotalsFooter, { StatusSplit } from '@/components/reports/ReportTotalsFooter';

// The first report under the Reports hub. Structure intentionally mirrors
// the Accounting Reports page (type tabs → filter bar → generic table →
// print/PDF) rather than introducing a second reporting UX: the two pages
// answer different questions but behave identically, which is the point of
// having a hub at all.

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[]; statusSplit?: StatusSplit[] }
interface CategoryOption { id: number; name: string }
interface ProjectOption { id: number; projectName: string }
interface VerticalOption { id: number; name: string }

const REPORT_TYPES = [
  { value: 'detail', label: 'Detail' },
  { value: 'by-category', label: 'By Category' },
  { value: 'by-sub-category', label: 'By Sub Category' },
  { value: 'by-vendor', label: 'By Vendor' },
  { value: 'by-project', label: 'By Project' },
  { value: 'by-vertical', label: 'By Vertical' },
  { value: 'by-payment-method', label: 'By Payment Method' },
  { value: 'monthly', label: 'Monthly' },
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
];

async function fetchReport(type: string, params: Record<string, string>): Promise<ReportResult> {
  const qs = new URLSearchParams({ type, ...params });
  const res = await fetch(`/api/reports/expenses?${qs.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}
async function fetchCategories(): Promise<CategoryOption[]> {
  const res = await fetch('/api/expenses/categories');
  if (!res.ok) throw new Error('Failed to fetch categories');
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
  if (value === null || value === undefined) return '—';
  if (type === 'currency' && typeof value === 'number') return formatCurrency(value, currencyCode);
  if (type === 'number' && typeof value === 'number') return value.toLocaleString('en-IN');
  return String(value);
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

export default function ExpenseReportPage() {
  const { has } = usePermissions();
  const canExport = has('view_expenses');
  // Deep-link support: ?verticalId=8&type=detail lands on exactly the rows
  // behind another view's total. Read once as initial state (not kept in
  // sync), so the user can then change filters without the URL fighting them.
  const searchParams = useSearchParams();
  const [type, setType] = useState(searchParams.get('type') || 'detail');
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [verticalId, setVerticalId] = useState(searchParams.get('verticalId') || '');
  // Arrives only via a drill-through link; there is no control for it,
  // because "only project-tagged spend" is a property of the figure that was
  // clicked, not something a user would set by hand.
  const [projectOnly, setProjectOnly] = useState(searchParams.get('projectOnly') === 'true');

  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (categoryId) params.categoryId = categoryId;
  if (status) params.status = status;
  if (projectId) params.projectId = projectId;
  if (verticalId) params.verticalId = verticalId;
  if (projectOnly) params.projectOnly = 'true';

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['expense-report', type, params],
    queryFn: () => fetchReport(type, params),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories-for-report'], queryFn: fetchCategories });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-for-expense-report'], queryFn: fetchProjects });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals-for-expense-report'], queryFn: fetchVerticals });

  useEffect(() => { if (isError) toast.error('Failed to load report'); }, [isError]);

  const exportPdf = () => {
    if (!report) return;
    generateReportPDF(report.title, report.columns, report.rows, `expense-${type}-${new Date().toISOString().slice(0, 10)}.pdf`, buildPdfFoot(report));
  };

  // Every row carries its own currencyCode — summaries are grouped per
  // currency, the detail tab per expense — so the formatter reads the row's
  // own code rather than a page-level one.
  const rowCurrency = (row: Record<string, any>) => String(row.currencyCode || 'INR');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-600 mb-1">
            <ArrowLeftIcon className="h-4 w-4" /> Reports
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Expense Report</h1>
            <p className="text-slate-500 text-xs">Spend by category, sub-category, vendor, project, vertical and month</p>
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

      {(verticalId || projectOnly) && (
        <p className="text-xs text-slate-500 -mt-2 flex items-center gap-2">
          <span>
            {verticalId
              ? 'Filtered to one vertical — Overall Expenses have no project, so no vertical, and are excluded.'
              : 'Showing project-tagged expenses only — Overall Expenses are excluded.'}
          </span>
          {projectOnly && (
            <button onClick={() => setProjectOnly(false)} className="text-amber-700 hover:text-amber-900 underline">
              show all
            </button>
          )}
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
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Verticals</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(from || to || categoryId || status || projectId || verticalId || projectOnly) && (
          <button onClick={() => { setFrom(''); setTo(''); setCategoryId(''); setStatus(''); setProjectId(''); setVerticalId(''); setProjectOnly(false); }} className="text-sm text-slate-500 hover:text-red-500">Clear</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : !report || report.rows.length === 0 ? (
          <div className="text-center py-16">
            <DocumentChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No data for this report</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting the filters or date range</p>
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
                        {fmtCell(row[col.key], col.type, rowCurrency(row))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <ReportTotalsFooter columns={report.columns} rows={report.rows} statusSplit={report.statusSplit} />
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
