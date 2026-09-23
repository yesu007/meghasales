'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon, InboxIcon } from '@heroicons/react/24/outline';
import { generatePayslipPDF } from '@/lib/generatePayslipPDF';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface LineItem { id: number; label: string; type: 'EARNING' | 'DEDUCTION'; amount: string }
interface MyPayslip {
  id: number;
  totalDays: number;
  payableDays: string;
  lopDays: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  run: { payPeriodYear: number; payPeriodMonth: number; status: string };
  lineItems: LineItem[];
}
interface MyPayslipsResponse {
  employee: { employeeCode: string; department: string | null; designation: string | null; name: string } | null;
  payslips: MyPayslip[];
}

async function fetchMyPayslips(): Promise<MyPayslipsResponse> {
  const res = await fetch('/api/payroll/my-payslips');
  if (!res.ok) throw new Error('Failed to fetch payslips');
  return res.json();
}

// Quarters, not calendar months — Q1 Jan-Mar, Q2 Apr-Jun, etc. Payslips
// arrive newest-first (see my-payslips/route.ts's own orderBy), so bucketing
// in a single pass over that order keeps each group internally sorted and
// the groups themselves newest-first too, with no extra sort needed.
function quarterOf(month: number): number {
  return Math.ceil(month / 3);
}
function quarterKey(year: number, month: number): string {
  return `${year}-Q${quarterOf(month)}`;
}
function quarterLabel(year: number, month: number): string {
  const q = quarterOf(month);
  const firstMonth = MONTH_NAMES[(q - 1) * 3];
  const lastMonth = MONTH_NAMES[q * 3 - 1];
  return `${firstMonth} – ${lastMonth} (${year})`;
}
function groupByQuarter(payslips: MyPayslip[]): Array<{ key: string; label: string; payslips: MyPayslip[] }> {
  const groups: Array<{ key: string; label: string; payslips: MyPayslip[] }> = [];
  const byKey = new Map<string, { key: string; label: string; payslips: MyPayslip[] }>();
  for (const p of payslips) {
    const key = quarterKey(p.run.payPeriodYear, p.run.payPeriodMonth);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: quarterLabel(p.run.payPeriodYear, p.run.payPeriodMonth), payslips: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.payslips.push(p);
  }
  return groups;
}

export default function MyPayslipsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-payslips'], queryFn: fetchMyPayslips });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Only the most recent quarter starts open — same "don't dump everything
  // on screen at once" reasoning as the per-payslip line-item accordion.
  const [expandedGroups, setExpandedGroups] = useState<Set<string> | null>(null);

  if (isLoading) {
    return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  if (!data?.employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Payslips</h1>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16">
          <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-lg font-medium text-slate-600">No payroll profile yet</p>
          <p className="text-sm text-slate-400 mt-1">Payslips will appear here once you&apos;re onboarded to payroll.</p>
        </div>
      </div>
    );
  }

  const download = (p: MyPayslip) => {
    generatePayslipPDF({
      employeeName: data.employee!.name,
      employeeCode: data.employee!.employeeCode,
      department: data.employee!.department,
      designation: data.employee!.designation,
      payPeriodLabel: `${MONTH_NAMES[p.run.payPeriodMonth - 1]} ${p.run.payPeriodYear}`,
      totalDays: p.totalDays,
      payableDays: Number(p.payableDays),
      lopDays: Number(p.lopDays),
      lineItems: p.lineItems.map((li) => ({ label: li.label, type: li.type, amount: Number(li.amount) })),
      grossEarnings: Number(p.grossEarnings),
      totalDeductions: Number(p.totalDeductions),
      netPay: Number(p.netPay),
      fileName: `Payslip-${data.employee!.employeeCode}-${p.run.payPeriodMonth}-${p.run.payPeriodYear}.pdf`,
    });
  };

  const groups = groupByQuarter(data.payslips);
  // Lazy-initialized once data is in — defaults to just the newest quarter
  // open, everything older starts collapsed.
  const openGroups = expandedGroups ?? new Set(groups.slice(0, 1).map((g) => g.key));
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev ?? openGroups);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Payslips</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">{data.employee.employeeCode}{data.employee.designation ? ` · ${data.employee.designation}` : ''}</p>
      </div>

      {data.payslips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <p className="text-center py-16 text-slate-400">No finalized payslips yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const groupOpen = openGroups.has(group.key);
            const groupNet = group.payslips.reduce((s, p) => s + Number(p.netPay), 0);
            return (
              <div key={group.key} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button onClick={() => toggleGroup(group.key)} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 hover:bg-slate-100">
                  <div>
                    <p className="font-semibold text-slate-800">{group.label}</p>
                    <p className="text-xs text-slate-400">{group.payslips.length} payslip{group.payslips.length > 1 ? 's' : ''} · Total Net ₹{groupNet.toLocaleString('en-IN')}</p>
                  </div>
                  {groupOpen ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                </button>
                {groupOpen && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {group.payslips.map((p) => (
                      <div key={p.id}>
                        <button onClick={() => setExpandedId((e) => (e === p.id ? null : p.id))} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
                          <div>
                            <p className="font-medium text-slate-800">{MONTH_NAMES[p.run.payPeriodMonth - 1]} {p.run.payPeriodYear}</p>
                            <p className="text-xs text-slate-400">{p.payableDays}/{p.totalDays} days · Net ₹{Number(p.netPay).toLocaleString('en-IN')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              onClick={(e) => { e.stopPropagation(); download(p); }}
                              className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800 font-medium"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" /> PDF
                            </span>
                            {expandedId === p.id ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                          </div>
                        </button>
                        {expandedId === p.id && (
                          <div className="px-4 pb-4">
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-slate-100">
                                {p.lineItems.map((li) => (
                                  <tr key={li.id}>
                                    <td className="py-1.5 text-slate-600">{li.label}</td>
                                    <td className="py-1.5 text-right text-slate-700">{li.type === 'DEDUCTION' ? '-' : ''}₹{Number(li.amount).toLocaleString('en-IN')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
