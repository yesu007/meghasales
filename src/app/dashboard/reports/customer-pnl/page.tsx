'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, ArrowLeftIcon, DocumentChartBarIcon, PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { computeReportTotals } from '@/lib/reportTotals';
import { usePermissions } from '@/hooks/usePermissions';
import ReportTotalsFooter from '@/components/reports/ReportTotalsFooter';
import LedgerDetailModal, { LedgerDetailTarget } from '@/components/reports/LedgerDetailModal';

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' | 'percent' }
interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[]; warning?: string }
interface VerticalOption { id: number; name: string }

const REPORT_TYPES = [
  { value: 'summary', label: 'Summary' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'by-project', label: 'By Project' },
];

const CURRENCY_OPTIONS = [
  { value: '', label: 'Native currency' },
  { value: 'INR', label: 'Convert to INR' },
  { value: 'USD', label: 'Convert to USD' },
];

async function fetchReport(type: string, params: Record<string, string>): Promise<ReportResult> {
  const qs = new URLSearchParams({ type, ...params });
  const res = await fetch(`/api/reports/customer-pnl?${qs.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch report');
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
  if (type === 'percent' && typeof value === 'number') return `${value.toFixed(1)}%`;
  return String(value);
}

// Loss overrides a positive budget attainment (see customerPnlReports.ts's
// deriveMetrics), so its color takes priority over the amber "needs a
// forecast revisit" read that Under/Over Budget share — the same rule the
// report itself applies, just expressed in a badge instead of a formula.
function statusClass(status: string): string {
  if (status === 'Loss') return 'bg-red-50 border-red-200 text-red-700';
  if (status === 'Under Budget' || status === 'Over Budget') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (status === 'On Budget') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return 'bg-slate-100 border-slate-200 text-slate-600'; // No Budget Set
}

// Last day of a YYYY-MM month as a local date string — see vertical-ledger's
// identical helper for why not toISOString().
function monthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPdfFoot(report: ReportResult): string[][] {
  const totals = computeReportTotals(report.columns, report.rows);
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

export default function CustomerPnlPage() {
  const { has } = usePermissions();
  const canExport = has('view_accounting') || has('view_projects');
  const [type, setType] = useState('summary');
  const [verticalId, setVerticalId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [convertTo, setConvertTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [detail, setDetail] = useState<LedgerDetailTarget | null>(null);

  const params: Record<string, string> = {};
  if (verticalId) params.verticalId = verticalId;
  if (from) params.from = from;
  if (to) params.to = to;
  if (convertTo) params.convertTo = convertTo;
  if (customerId) params.customerId = customerId;

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['customer-pnl', type, params],
    queryFn: () => fetchReport(type, params),
  });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals-for-customer-pnl'], queryFn: fetchVerticals });

  useEffect(() => { if (isError) toast.error('Failed to load report'); }, [isError]);
  useEffect(() => { if (report?.warning) toast(report.warning, { icon: '⚠️' }); }, [report?.warning]);

  const exportPdf = () => {
    if (!report) return;
    generateReportPDF(report.title, report.columns, report.rows, `customer-pnl-${type}-${new Date().toISOString().slice(0, 10)}.pdf`, buildPdfFoot(report));
  };

  // Only 'by-project' rows carry a single _projectId, so only those cells
  // open the shared drill-down (reusing Project Ledger's own transactions /
  // Expense Report endpoints) — a 'summary' row can span many projects and
  // has nothing single to scope the popup to. Clicking its Customer name
  // instead re-scopes the whole report to 'by-project' for that customer.
  const detailFor = (row: Record<string, any>, colKey: 'actual' | 'expense'): LedgerDetailTarget => {
    let f = from || undefined;
    let t = to || undefined;
    if (typeof row.period === 'string' && /^\d{4}-\d{2}$/.test(row.period)) {
      f = `${row.period}-01`;
      t = monthEnd(row.period);
    }
    const projectId = row._projectId ? Number(row._projectId) : undefined;
    const qs = new URLSearchParams({ type: 'detail' });
    if (projectId) qs.set('projectId', String(projectId)); else qs.set('projectOnly', 'true');
    if (row._verticalId) qs.set('verticalId', String(row._verticalId));
    if (f) qs.set('from', f);
    if (t) qs.set('to', t);
    return {
      mode: colKey === 'expense' ? 'expense' : 'income',
      title: String(row.project ?? row.customer ?? 'Selection'),
      currencyCode: String(row.currencyCode || 'INR'),
      projectId,
      verticalId: row._verticalId ? Number(row._verticalId) : undefined,
      from: f,
      to: t,
      projectOnly: !projectId,
      expenseHref: colKey === 'expense' ? `/dashboard/reports/expenses?${qs.toString()}` : undefined,
    };
  };

  const drillToCustomer = (row: Record<string, any>) => {
    if (!row._customerId) return;
    setCustomerId(String(row._customerId));
    setCustomerName(String(row.customer || ''));
    setType('by-project');
  };

  const hasFilters = verticalId || from || to || customerId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-600 mb-1">
            <ArrowLeftIcon className="h-4 w-4" /> Reports
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Customer P&amp;L</h1>
            <p className="text-slate-500 text-xs">Budget, billed revenue, expense and profit per customer, rolled up from its projects</p>
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

      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORT_TYPES.map((t) => (
          <button key={t.value} onClick={() => setType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t.value ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center print:hidden">
        {customerId && (
          <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
            {customerName || 'Customer'}
            <button onClick={() => { setCustomerId(''); setCustomerName(''); }} aria-label="Clear customer filter" className="hover:text-amber-950">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </span>
        )}
        <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Verticals</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={convertTo} onChange={(e) => setConvertTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        {hasFilters && (
          <button onClick={() => { setVerticalId(''); setFrom(''); setTo(''); setCustomerId(''); setCustomerName(''); }} className="text-sm text-slate-500 hover:text-red-500">Clear</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : !report || report.rows.length === 0 ? (
          <div className="text-center py-16">
            <DocumentChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No entries for this report</p>
            <p className="text-sm text-slate-400 mt-1">Try a wider date range or a different vertical</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {report.columns.map((col) => (
                    <th key={col.key} className={`px-4 py-3 font-semibold text-slate-600 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, idx) => (
                  <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors border-b border-slate-100 last:border-0`}>
                    {report.columns.map((col) => {
                      if (col.key === 'status') {
                        return (
                          <td key={col.key} className="px-4 py-3">
                            <span className={`inline-block text-xs font-medium rounded-full px-2 py-0.5 border whitespace-nowrap ${statusClass(String(row.status))}`}>{row.status}</span>
                          </td>
                        );
                      }
                      if (col.key === 'customer' && type === 'summary' && row._customerId) {
                        return (
                          <td key={col.key} className="px-4 py-3 text-left">
                            <button type="button" onClick={() => drillToCustomer(row)} className="text-amber-700 hover:text-amber-900 underline decoration-amber-300 underline-offset-2 font-medium">
                              {row.customer}
                            </button>
                          </td>
                        );
                      }
                      const clickable = row._projectId && ['actual', 'expense'].includes(col.key) && Number(row[col.key]) > 0;
                      return (
                        <td key={col.key} className={`px-4 py-3 text-slate-700 whitespace-nowrap ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>
                          {clickable ? (
                            <button type="button"
                              onClick={() => setDetail(detailFor(row, col.key as 'actual' | 'expense'))}
                              className="text-amber-700 hover:text-amber-900 underline decoration-amber-300 underline-offset-2">
                              {fmtCell(row[col.key], col.type, String(row.currencyCode || 'INR'))}
                            </button>
                          ) : fmtCell(row[col.key], col.type, String(row.currencyCode || 'INR'))}
                        </td>
                      );
                    })}
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
