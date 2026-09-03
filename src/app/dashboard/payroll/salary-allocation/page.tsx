'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, ChartPieIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';

const COMPANY_WIDE = 'company-wide';

interface VerticalCol { id: number; name: string; headName: string | null }
interface EmployeeRow {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  monthlySalary: number | null;
  allocations: Record<string, number>; // key = String(verticalId) or 'company-wide'
  totalAllocationPct: number;
  check: 'OK' | 'SHARED' | 'MISMATCH';
}
interface Weightage { verticalKey: string; allocatedAmount: number; weightagePct: number }
interface MatrixResponse {
  verticals: VerticalCol[];
  employees: EmployeeRow[];
  totals: { monthlySalary: number };
  weightage: Weightage[];
}

async function fetchMatrix(): Promise<MatrixResponse> {
  const res = await fetch('/api/employee-vertical-allocations');
  if (!res.ok) throw new Error('Failed to fetch salary allocation');
  return res.json();
}

function cellKey(employeeId: number, verticalKey: string) {
  return `${employeeId}|${verticalKey}`;
}

function checkClass(check: EmployeeRow['check']) {
  if (check === 'OK') return 'text-emerald-700';
  if (check === 'SHARED') return 'text-slate-400';
  return 'text-amber-700';
}

// Page numbers with ellipsis — same helper as Expense Budgets' matrix.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

export default function SalaryAllocationPage() {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading, isError } = useQuery({ queryKey: ['employee-vertical-allocations'], queryFn: fetchMatrix });
  const verticals = data?.verticals ?? [];
  const employees = data?.employees ?? [];

  // Verticals as columns, Company-wide always last, same convention as
  // Expense Budgets' own matrix.
  const columnKeys = useMemo(() => [...verticals.map((v) => String(v.id)), COMPANY_WIDE], [verticals]);
  const columnLabel = (key: string) => (key === COMPANY_WIDE ? 'Company-wide' : verticals.find((v) => String(v.id) === key)?.name || key);
  const columnHead = (key: string) => (key === COMPANY_WIDE ? null : verticals.find((v) => String(v.id) === key)?.headName || null);

  const totalPages = Math.max(1, Math.ceil(employees.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedEmployees = useMemo(() => employees.slice(safePage * pageSize, safePage * pageSize + pageSize), [employees, safePage, pageSize]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employee-vertical-allocations'] });

  const updateCell = useMutation({
    mutationFn: async ({ employeeId, allocations }: { employeeId: number; allocations: { verticalId: number | null; percentage: number }[] }) => {
      const res = await fetch(`/api/employee-vertical-allocations/${employeeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allocations }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update allocation'); }
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const commitCell = (employee: EmployeeRow, columnKey: string) => {
    const key = cellKey(employee.id, columnKey);
    if (editingCell?.key !== key) return;
    const raw = editingCell.value.trim();
    setEditingCell(null);
    const newPct = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(newPct) || newPct < 0 || newPct > 100) { toast.error('Enter a percentage between 0 and 100'); return; }
    const currentPct = employee.allocations[columnKey] || 0;
    if (newPct === currentPct) return;
    const mergedAllocations = columnKeys.map((key2) => ({
      verticalId: key2 === COMPANY_WIDE ? null : Number(key2),
      percentage: key2 === columnKey ? newPct : (employee.allocations[key2] || 0),
    }));
    updateCell.mutate({ employeeId: employee.id, allocations: mergedAllocations });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Salary Allocation</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Each employee&apos;s monthly salary split by percentage across business verticals</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the salary allocation matrix.</p>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <ChartPieIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No active employees found</p>
            <p className="text-sm text-slate-400 mt-1">Add employees under Payroll → Employees first</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-4 py-3">
            <table className="w-full border-collapse text-sm table-fixed">
              <colgroup>
                <col className="w-56" />
                <col className="w-28" />
                {columnKeys.map((k) => <col key={k} className="w-32" />)}
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-white text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 pr-3 border-b border-slate-200">Employee</th>
                  <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Salary</th>
                  {columnKeys.map((k) => (
                    <th key={k} className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">
                      <div className="truncate" title={columnLabel(k)}>{columnLabel(k)}</div>
                      {columnHead(k) && <div className="truncate text-[10px] font-normal normal-case text-slate-400" title={`Head: ${columnHead(k)}`}>Head: {columnHead(k)}</div>}
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Row Total</th>
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-amber-50/40 group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-amber-50/40 py-2 pr-3">
                      <div className="truncate font-medium text-slate-800" title={e.name}>{e.name}</div>
                      <div className="truncate text-[10px] text-slate-400" title={[e.designation, e.department].filter(Boolean).join(' · ')}>
                        {[e.designation, e.department].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700" title={e.monthlySalary === null ? 'No salary structure assigned in Payroll' : undefined}>
                      {e.monthlySalary === null ? '—' : formatCurrency(e.monthlySalary, 'INR')}
                    </td>
                    {columnKeys.map((k) => {
                      const key = cellKey(e.id, k);
                      const isEditing = editingCell?.key === key;
                      const pct = e.allocations[k] || 0;
                      const displayValue = isEditing ? editingCell!.value : (pct ? pct.toFixed(1) : '');
                      return (
                        <td key={k} className="py-1 px-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <input
                              value={displayValue}
                              placeholder="—"
                              onFocus={() => setEditingCell({ key, value: pct ? String(pct) : '' })}
                              onChange={(ev) => setEditingCell({ key, value: ev.target.value.replace(/[^0-9.]/g, '') })}
                              onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                              onBlur={() => commitCell(e, k)}
                              className="w-[56px] text-right bg-transparent outline-none rounded px-1.5 py-1 text-slate-800 focus:bg-white focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className={`py-2 px-3 text-right tabular-nums font-semibold ${checkClass(e.check)}`}>
                      {e.totalAllocationPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="sticky left-0 bg-slate-50 py-2.5 pr-3 font-semibold text-slate-800">Monthly Salary Allocation</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(data!.totals.monthlySalary, 'INR')}</td>
                  {columnKeys.map((k) => {
                    const w = data!.weightage.find((x) => x.verticalKey === k);
                    return <td key={k} className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(w?.allocatedAmount ?? 0, 'INR')}</td>;
                  })}
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-700">{formatCurrency(data!.totals.monthlySalary, 'INR')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!isLoading && employees.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {getPageNumbers(safePage, totalPages).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === safePage ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, employees.length)} of {employees.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
