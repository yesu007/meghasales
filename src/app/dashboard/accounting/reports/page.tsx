'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, PrinterIcon, DocumentChartBarIcon } from '@heroicons/react/24/outline';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { formatCurrency } from '@/lib/currency';

const REPORT_TYPES = [
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'aging', label: 'Customer Aging' },
  { value: 'collection', label: 'Collection' },
  { value: 'monthly-collection', label: 'Monthly Collection' },
  { value: 'payment-history', label: 'Payment History' },
];

interface Lead { id: number; companyName: string }

async function fetchReport(type: string, params: Record<string, string>) {
  const query = new URLSearchParams({ type, ...params }).toString();
  const res = await fetch(`/api/accounting/reports?${query}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch customers');
  const data = await res.json();
  return data.content;
}

function fmtCell(value: any, type: string | undefined, currencyCode: string): string {
  if (type === 'currency' && typeof value === 'number') return formatCurrency(value, currencyCode);
  if (type === 'number' && typeof value === 'number') return value.toLocaleString('en-IN');
  return String(value ?? '—');
}

export default function AccountingReportsPage() {
  const [type, setType] = useState('outstanding');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [leadId, setLeadId] = useState('');

  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (leadId) params.leadId = leadId;

  const { data: report, isLoading, isError: isReportError } = useQuery({
    queryKey: ['accounting-report', type, params],
    queryFn: () => fetchReport(type, params),
  });

  const { data: leads = [], isError: isLeadsError } = useQuery<Lead[]>({ queryKey: ['leads-for-report'], queryFn: fetchLeads });

  useEffect(() => {
    if (isReportError) toast.error('Failed to load report');
  }, [isReportError]);

  useEffect(() => {
    if (isLeadsError) toast.error('Failed to load customers');
  }, [isLeadsError]);

  const exportCsv = () => {
    const exportParams = new URLSearchParams({ type, ...params });
    window.open(`/api/accounting/reports/export?${exportParams.toString()}`, '_blank');
  };

  const exportPdf = () => {
    if (!report) return;
    generateReportPDF(report.title, report.columns, report.rows, `${type}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 mt-1">Outstanding, aging, collection, and overdue reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            <PrinterIcon className="h-4 w-4" /> Print
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            <ArrowDownTrayIcon className="h-4 w-4" /> CSV
          </button>
          <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <ArrowDownTrayIcon className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === t.value ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center print:hidden">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">All Customers</option>
          {leads.map((l) => <option key={l.id} value={l.id}>{l.companyName}</option>)}
        </select>
        {(from || to || leadId) && (
          <button onClick={() => { setFrom(''); setTo(''); setLeadId(''); }} className="text-sm text-slate-500 hover:text-red-500">Clear</button>
        )}
      </div>

      {/* Table */}
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
                  {report.columns.map((c: any) => (
                    <th key={c.key} className={`px-4 py-3 font-semibold text-slate-700 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {report.columns.map((c: any) => (
                      <td key={c.key} className={`px-4 py-3 text-slate-700 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{fmtCell(row[c.key], c.type, row.currencyCode || 'INR')}</td>
                    ))}
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
