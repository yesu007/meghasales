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

export default function MyPayslipsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-payslips'], queryFn: fetchMyPayslips });
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Payslips</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">{data.employee.employeeCode}{data.employee.designation ? ` · ${data.employee.designation}` : ''}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {data.payslips.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No finalized payslips yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.payslips.map((p) => (
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
    </div>
  );
}
