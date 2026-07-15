'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';

interface Lead { id: number; companyName: string }

const TYPE_LABELS: Record<string, string> = { INVOICE: 'Invoice', PAYMENT: 'Payment', CREDIT_NOTE: 'Credit Note' };
const TYPE_STYLES: Record<string, string> = {
  INVOICE: 'bg-blue-100 text-blue-700',
  PAYMENT: 'bg-green-100 text-green-700',
  CREDIT_NOTE: 'bg-amber-100 text-amber-700',
};

function fmt(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content;
}

async function fetchLedger(leadId: string, from: string, to: string) {
  const params = new URLSearchParams({ leadId });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`/api/accounting/customer-ledger?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch ledger');
  return res.json();
}

export default function CustomerLedgerPage() {
  const [leadId, setLeadId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ['leads-for-ledger'], queryFn: fetchLeads });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['customer-ledger', leadId, from, to],
    queryFn: () => fetchLedger(leadId, from, to),
    enabled: !!leadId,
  });

  const exportCsv = () => {
    if (!ledger) return;
    const header = ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'];
    const rows = [
      ['', 'Opening Balance', '', '', '', ledger.openingBalance],
      ...ledger.transactions.map((t: any) => [dayjs(t.date).format('YYYY-MM-DD'), TYPE_LABELS[t.type] || t.type, t.reference, t.debit || '', t.credit || '', t.balance]),
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${ledger.companyName}-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customer Ledger</h1>
          <p className="text-slate-500 mt-1">Running balance of invoices, payments, and credit notes per customer</p>
        </div>
        {ledger && (
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            <ArrowDownTrayIcon className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
          <option value="">Select a customer</option>
          {leads.map((l) => <option key={l.id} value={l.id}>{l.companyName}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
        </div>
      </div>

      {!leadId ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
          <BookOpenIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-lg font-medium text-slate-600">Select a customer</p>
          <p className="text-sm text-slate-400 mt-1">Choose a customer above to view their ledger</p>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <p className="text-sm font-semibold text-slate-800">{ledger.companyName}</p>
              <p className="text-xs text-slate-500">Opening Balance: {fmt(ledger.openingBalance)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Closing Balance</p>
              <p className="text-lg font-bold text-slate-800">{fmt(ledger.closingBalance)}</p>
            </div>
          </div>
          {ledger.transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">No transactions in this period</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Reference</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Debit</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Credit</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.transactions.map((t: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{dayjs(t.date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[t.type] || 'bg-slate-100 text-slate-700'}`}>{TYPE_LABELS[t.type] || t.type}</span></td>
                    <td className="px-4 py-3 text-slate-600">{t.reference}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.debit > 0 ? fmt(t.debit) : '—'}</td>
                    <td className="px-4 py-3 text-right text-green-700">{t.credit > 0 ? fmt(t.credit) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(t.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
