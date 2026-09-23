'use client';

import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';

interface EmployeeOption { id: number; employeeCode: string; userName: string }
interface Repayment { id: number; runId: number | null; periodYear: number; periodMonth: number; amount: string; status: string; createdAt: string }
interface LoanRow {
  id: number;
  employeeId: number;
  principal: string;
  outstandingBalance: string;
  monthlyInstallment: string;
  reason: string | null;
  disbursedDate: string;
  status: string;
  employee: { employeeCode: string; firstName: string; lastName: string };
  // Only present when the list is fetched with year/month — see
  // GET /api/payroll/loans's own comment on how these are derived.
  collectionStatus?: 'PENDING' | 'COLLECTED';
  alreadySentThisPeriod?: boolean;
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};
const COLLECTION_STATUS_COLORS: Record<string, string> = {
  COLLECTED: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

// year/month are optional — the Send to Payroll modal fetches every active
// loan up front (no period yet, so no collectionStatus/alreadySentThisPeriod
// on the rows), then refetches with a period once a run is picked to learn
// which of them are already sent/collected for that specific run.
async function fetchLoans(year?: number, month?: number): Promise<LoanRow[]> {
  const qs = year && month ? `?year=${year}&month=${month}` : '';
  const res = await fetch(`/api/payroll/loans${qs}`);
  if (!res.ok) throw new Error('Failed to fetch loans');
  return res.json();
}
async function fetchEmployees(): Promise<EmployeeOption[]> {
  // size=200&status=ACTIVE — same convention as every other full-roster
  // employee picker (e.g. the Manager dropdown on Employee Details). No
  // query params here previously meant this silently fell back to the
  // API's default page size of 10, so only the 10 most-recently-created
  // employees ever showed up in the dropdown.
  const res = await fetch('/api/payroll/employees?size=200&status=ACTIVE');
  if (!res.ok) throw new Error('Failed to fetch employees');
  return (await res.json()).content;
}
async function fetchLoanDetail(id: number): Promise<LoanRow & { repayments: Repayment[] }> {
  const res = await fetch(`/api/payroll/loans/${id}`);
  if (!res.ok) throw new Error('Failed to fetch loan');
  return res.json();
}

export default function LoansPage() {
  const queryClient = useQueryClient();
  const now = dayjs();
  const [year, setYear] = useState(now.year());
  const [month, setMonth] = useState(now.month() + 1);

  const { data: loans = [], isLoading } = useQuery({ queryKey: ['loans', year, month], queryFn: () => fetchLoans(year, month) });
  const { data: employees = [] } = useQuery({ queryKey: ['payroll-employees-all'], queryFn: fetchEmployees });

  const [showForm, setShowForm] = useState(false);
  const blankForm = { employeeId: '', principal: '', monthlyInstallment: '', disbursedDate: dayjs().format('YYYY-MM-DD'), reason: '' };
  const [form, setForm] = useState(blankForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);

  const createLoan = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create loan'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['loans'] }); toast.success('Loan created'); setShowForm(false); setForm(blankForm); },
    onError: (err: Error) => toast.error(err.message),
  });

  const goPrevMonth = () => { const d = dayjs(`${year}-${month}-01`).subtract(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };
  const goNextMonth = () => { const d = dayjs(`${year}-${month}-01`).add(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Loans &amp; Advances</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Track employee loans and send installments to Payroll</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSendModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] border border-amber-600 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50">
            <PaperAirplaneIcon className="h-4 w-4" /> Send to Payroll
          </button>
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> New Loan
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); if (!form.employeeId || !form.principal || !form.monthlyInstallment) { toast.error('Employee, principal, and monthly installment are required'); return; } createLoan.mutate(); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
              <AddableSelect
                value={form.employeeId}
                onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                options={employees.map((e) => ({ value: String(e.id), label: `${e.userName} (${e.employeeCode})` }))}
                placeholder="Select employee"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Disbursed Date</label>
              <input type="date" value={form.disbursedDate} onChange={(e) => setForm((f) => ({ ...f, disbursedDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Principal (₹)</label>
              <input type="number" min="1" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Installment (₹)</label>
              <input type="number" min="1" value={form.monthlyInstallment} onChange={(e) => setForm((f) => ({ ...f, monthlyInstallment: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="e.g. Medical emergency advance" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={createLoan.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Create Loan</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <span className="text-xs font-medium text-slate-500 uppercase mr-1">Collection status for</span>
          <button onClick={goPrevMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Previous month"><ChevronLeftIcon className="h-4 w-4" /></button>
          <span className="font-medium">{MONTH_NAMES[month - 1]} {year}</span>
          <button onClick={goNextMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Next month"><ChevronRightIcon className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : loans.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No loans yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Principal</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Monthly Installment</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Outstanding</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Collection Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan, idx) => (
                  <LoanRowView key={loan.id} loan={loan} expanded={expandedId === loan.id} onToggle={() => setExpandedId((id) => (id === loan.id ? null : loan.id))} idx={idx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sendModalOpen && (
        <SendToPayrollModal defaultYear={year} defaultMonth={month} onClose={() => setSendModalOpen(false)} />
      )}
    </div>
  );
}

function LoanRowView({ loan, expanded, onToggle, idx }: { loan: LoanRow; expanded: boolean; onToggle: () => void; idx: number }) {
  const { data: detail } = useQuery({ queryKey: ['loan', loan.id], queryFn: () => fetchLoanDetail(loan.id), enabled: expanded });

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}
      >
        <td className="px-4 py-3">
          <p className="font-medium text-slate-800">{loan.employee.firstName} {loan.employee.lastName} <span className="text-xs text-slate-400 font-normal">({loan.employee.employeeCode})</span></p>
          <p className="text-xs text-slate-400">{loan.reason || 'No reason given'}</p>
        </td>
        <td className="px-4 py-3 text-right text-slate-600">₹{Number(loan.principal).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right text-slate-600">₹{Number(loan.monthlyInstallment).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right text-slate-700">₹{Number(loan.outstandingBalance).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[loan.status]}`}>{loan.status}</span></td>
        <td className="px-4 py-3">
          {loan.collectionStatus ? (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${COLLECTION_STATUS_COLORS[loan.collectionStatus]}`}>
              {loan.collectionStatus === 'COLLECTED' ? 'Collected' : 'Pending'}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">{expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400 inline-block" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400 inline-block" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-4 py-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Repayment History</p>
              {detail?.repayments.length ? (
                <table className="w-full text-sm max-w-md">
                  <tbody className="divide-y divide-slate-100">
                    {detail.repayments.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 text-slate-600">{MONTH_NAMES[r.periodMonth - 1]} {r.periodYear}{r.runId == null && <span className="text-slate-400"> (not yet in a run)</span>}</td>
                        <td className="py-1.5 text-right text-slate-700">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                        <td className="py-1.5 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.status === 'APPLIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-slate-400">No installments applied yet — use Send to Payroll above.</p>}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Centralized alternative to opening each loan individually and applying
// its installment one at a time — reuses the exact same
// /api/payroll/loans/[id]/apply-to-run endpoint (and therefore the same
// recalculatePayslip/duplicate-prevention logic) per selected loan, rather
// than a second, parallel payroll-deduction code path.
function SendToPayrollModal({ defaultYear, defaultMonth, onClose }: { defaultYear: number; defaultMonth: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const goPrevMonth = () => { const d = dayjs(`${year}-${month}-01`).subtract(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };
  const goNextMonth = () => { const d = dayjs(`${year}-${month}-01`).add(1, 'month'); setYear(d.year()); setMonth(d.month() + 1); };

  // Every active loan loads for whatever month is selected — a month
  // doesn't need a PayrollRun to exist yet (see fetchLoans/apply-to-run's
  // own comments): sending here just records the intent, and it attaches
  // automatically once that period's payroll is generated.
  const { data: loans = [], isLoading: loadingLoans } = useQuery({
    queryKey: ['loans', year, month],
    queryFn: () => fetchLoans(year, month),
  });
  const rows = loans.filter((l) => l.status === 'ACTIVE');

  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const amountFor = (loan: LoanRow) => amounts[loan.id] ?? String(Math.min(Number(loan.monthlyInstallment), Number(loan.outstandingBalance)));

  const [sending, setSending] = useState(false);

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const handleSend = async () => {
    const toSend = rows.filter((l) => selected[l.id] && !l.alreadySentThisPeriod);
    if (toSend.length === 0) { toast.error('Select at least one loan to send'); return; }

    setSending(true);
    let attachedCount = 0;
    let recordedCount = 0;
    const failures: string[] = [];
    for (const loan of toSend) {
      const amount = Number(amountFor(loan));
      if (!amount || amount <= 0) { failures.push(`${loan.employee.firstName} ${loan.employee.lastName}: invalid amount`); continue; }
      try {
        const res = await fetch(`/api/payroll/loans/${loan.id}/apply-to-run`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payPeriodYear: year, payPeriodMonth: month, amount }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'Failed');
        if (body.attached) attachedCount += 1; else recordedCount += 1;
      } catch (err: any) {
        failures.push(`${loan.employee.firstName} ${loan.employee.lastName}: ${err.message}`);
      }
    }
    setSending(false);

    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    queryClient.invalidateQueries({ queryKey: ['payroll-run'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet'] });

    if (attachedCount > 0) toast.success(`${attachedCount} installment(s) applied to ${periodLabel}'s payroll`);
    if (recordedCount > 0) toast.success(`${recordedCount} installment(s) recorded for ${periodLabel} — will apply once that period's payroll is generated`);
    failures.forEach((f) => toast.error(f));
    if (failures.length === 0) onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Payroll Month</span>
            <button onClick={goPrevMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Previous month"><ChevronLeftIcon className="h-4 w-4" /></button>
            <span className="font-medium text-slate-600">{periodLabel}</span>
            <button onClick={goNextMonth} className="p-1 rounded hover:bg-slate-100" aria-label="Next month"><ChevronRightIcon className="h-4 w-4" /></button>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="h-5 w-5" /></button>
        </div>

        <div className="p-6 pb-8 space-y-4 overflow-y-auto">
          {loadingLoans ? (
            <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center py-10 text-slate-400 text-sm">No active loans found.</p>
          ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8"></th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Employee</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Employee ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Reason</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Principal</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Monthly Installment</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Outstanding</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Current Month Deduction</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((loan) => (
                      <tr key={loan.id} className={loan.alreadySentThisPeriod ? 'bg-slate-50' : undefined}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            disabled={loan.alreadySentThisPeriod}
                            checked={!!selected[loan.id] && !loan.alreadySentThisPeriod}
                            onChange={(e) => setSelected((s) => ({ ...s, [loan.id]: e.target.checked }))}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-800">{loan.employee.firstName} {loan.employee.lastName}</td>
                        <td className="px-3 py-2 text-slate-600">{loan.employee.employeeCode}</td>
                        <td className="px-3 py-2 text-slate-600">{loan.reason || 'Personal'}</td>
                        <td className="px-3 py-2 text-right text-slate-600">₹{Number(loan.principal).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-slate-600">₹{Number(loan.monthlyInstallment).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-slate-600">₹{Number(loan.outstandingBalance).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            disabled={loan.alreadySentThisPeriod}
                            value={amountFor(loan)}
                            onChange={(e) => setAmounts((a) => ({ ...a, [loan.id]: e.target.value }))}
                            className="w-24 text-right px-2 py-1 border border-slate-300 rounded text-slate-700 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {loan.alreadySentThisPeriod ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${loan.collectionStatus === 'COLLECTED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {loan.collectionStatus === 'COLLECTED' ? 'Collected' : 'Already sent'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button
              onClick={handleSend}
              disabled={sending || rows.length === 0 || rows.every((l) => l.alreadySentThisPeriod)}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send to Payroll'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
