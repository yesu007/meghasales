'use client';

import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';
import ReceiptViewerModal from '@/components/payroll/ReceiptViewerModal';

interface ExpenseClaimRow {
  id: number;
  expenseDate: string;
  description: string;
  amount: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  paymentType: 'HAND_CASH' | 'BANK_TRANSFER' | null;
  employee: { employeeCode: string; firstName: string; lastName: string; department: string | null };
  category: { id: number; name: string };
  lead: { id: number; companyName: string } | null;
  project: { id: number; projectName: string } | null;
  product: { id: number; productName: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-green-100 text-green-700',
};

const PAYMENT_TYPE_OPTIONS = [
  { value: 'HAND_CASH', label: 'Hand Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
];
const PAYMENT_TYPE_LABELS: Record<string, string> = { HAND_CASH: 'Hand Cash', BANK_TRANSFER: 'Bank Transfer' };

async function fetchClaims(status: string): Promise<ExpenseClaimRow[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`/api/payroll/expense-claims${params}`);
  if (!res.ok) throw new Error('Failed to fetch reimbursements');
  return res.json();
}

export default function ExpenseClaimsManagementPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Employee/Customer/Project filters — purely client-side on top of the
  // already status-filtered `claims` list (this queue is a bounded review
  // set, not a paginated table), so no extra API round trip is needed.
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  // The Mark as Paid confirmation popup — holds the claim being paid (null
  // = closed) and the payment type picked in it, separate from any other
  // row state so opening it never touches the Approve/Reject flows below.
  const [payingClaim, setPayingClaim] = useState<ExpenseClaimRow | null>(null);
  const [paymentType, setPaymentType] = useState('');
  // The receipt preview popup — holds the claim whose attachment is being
  // viewed (null = closed), opened instead of navigating away via a plain
  // <a target="_blank">.
  const [viewingReceipt, setViewingReceipt] = useState<ExpenseClaimRow | null>(null);

  const { data: claims = [], isLoading } = useQuery({ queryKey: ['expense-claims', statusFilter], queryFn: () => fetchClaims(statusFilter) });

  const employeeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of claims) seen.set(c.employee.employeeCode, `${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeCode})`);
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [claims]);
  const customerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of claims) if (c.lead) seen.set(c.lead.id, c.lead.companyName);
    return Array.from(seen, ([id, label]) => ({ value: String(id), label }));
  }, [claims]);
  const projectOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of claims) if (c.project) seen.set(c.project.id, c.project.projectName);
    return Array.from(seen, ([id, label]) => ({ value: String(id), label }));
  }, [claims]);
  const productOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of claims) if (c.product) seen.set(c.product.id, c.product.productName);
    return Array.from(seen, ([id, label]) => ({ value: String(id), label }));
  }, [claims]);

  const filteredClaims = claims.filter(
    (c) =>
      (!employeeFilter || c.employee.employeeCode === employeeFilter) &&
      (!customerFilter || String(c.lead?.id) === customerFilter) &&
      (!projectFilter || String(c.project?.id) === projectFilter) &&
      (!productFilter || String(c.product?.id) === productFilter)
  );

  const decide = useMutation({
    mutationFn: async ({ id, status, rejectionReason, paymentType }: { id: number; status: 'APPROVED' | 'REJECTED' | 'PAID'; rejectionReason?: string; paymentType?: string }) => {
      const res = await fetch(`/api/payroll/expense-claims/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, rejectionReason, paymentType }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update reimbursement'); }
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success(`Reimbursement ${status.toLowerCase()}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reject = (row: ExpenseClaimRow) => {
    const reason = window.prompt(`Reason for rejecting ${row.employee.firstName} ${row.employee.lastName}'s reimbursement:`);
    if (reason == null) return;
    if (!reason.trim()) { toast.error('A rejection reason is required'); return; }
    decide.mutate({ id: row.id, status: 'REJECTED', rejectionReason: reason.trim() });
  };

  const closePayModal = () => { setPayingClaim(null); setPaymentType(''); };
  const confirmPayment = () => {
    if (!payingClaim) return;
    if (!paymentType) { toast.error('Payment Type is required'); return; }
    decide.mutate({ id: payingClaim.id, status: 'PAID', paymentType }, { onSuccess: closePayModal });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reimbursements Approvals</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:flex lg:flex-wrap lg:justify-end">
          <div className="sm:w-36">
            <AddableSelect value={employeeFilter} onChange={setEmployeeFilter} options={employeeOptions} placeholder="Employees" />
          </div>
          <div className="sm:w-36">
            <AddableSelect value={customerFilter} onChange={setCustomerFilter} options={customerOptions} placeholder="Customers" />
          </div>
          <div className="sm:w-36">
            <AddableSelect value={projectFilter} onChange={setProjectFilter} options={projectOptions} placeholder="Projects" />
          </div>
          <div className="sm:w-36">
            <AddableSelect value={productFilter} onChange={setProductFilter} options={productOptions} placeholder="Products" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex gap-2">
          {['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', ''].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : filteredClaims.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No {statusFilter.toLowerCase() || ''} reimbursements match these filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Expense Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Project</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Product</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map((c, idx) => (
                  <Fragment key={c.id}>
                    <tr onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))} className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{c.employee.firstName} {c.employee.lastName}</p>
                        <p className="text-xs text-slate-400">{c.employee.employeeCode}{c.employee.department ? ` · ${c.employee.department}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{dayjs(c.expenseDate).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-3 text-slate-600">{c.category.name}</td>
                      <td className="px-4 py-3 text-slate-600">{c.lead?.companyName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.project?.projectName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.product?.productName || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">₹{Number(c.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                          {c.status === 'SUBMITTED' && (
                            <>
                              <button onClick={() => decide.mutate({ id: c.id, status: 'APPROVED' })} className="text-xs font-medium text-green-700 hover:text-green-800">Approve</button>
                              <button onClick={() => reject(c)} className="text-xs font-medium text-red-600 hover:text-red-700">Reject</button>
                            </>
                          )}
                          {c.status === 'APPROVED' && (
                            <button onClick={() => setPayingClaim(c)} className="text-xs font-medium text-green-700 hover:text-green-800">Mark Paid</button>
                          )}
                          {expandedId === c.id ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-1">Description</p>
                              <p className="text-sm text-slate-700">{c.description}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-1">Receipt</p>
                              {c.attachmentUrl ? (
                                <button onClick={(e) => { e.stopPropagation(); setViewingReceipt(c); }} className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800">
                                  <PaperClipIcon className="h-3.5 w-3.5" /> {c.attachmentName || 'View receipt'}
                                </button>
                              ) : <p className="text-sm text-slate-400">None attached</p>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-4">
                            <div><p className="text-xs text-slate-400 uppercase">Submitted</p><p className="text-slate-700">{c.submittedAt ? dayjs(c.submittedAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Approved</p><p className="text-slate-700">{c.approvedAt ? dayjs(c.approvedAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Rejected</p><p className="text-slate-700">{c.rejectedAt ? dayjs(c.rejectedAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Paid</p><p className="text-slate-700">{c.paidAt ? dayjs(c.paidAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Payment Type</p><p className="text-slate-700">{c.paymentType ? PAYMENT_TYPE_LABELS[c.paymentType] : '-'}</p></div>
                          </div>
                          {c.status === 'REJECTED' && c.rejectionReason && (
                            <p className="text-sm text-red-600 mt-3"><span className="font-medium">Rejection reason:</span> {c.rejectionReason}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payingClaim && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={closePayModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Mark Reimbursement as Paid</h3>
                <p className="text-xs text-slate-400 mt-0.5">{payingClaim.employee.firstName} {payingClaim.employee.lastName} · ₹{Number(payingClaim.amount).toLocaleString('en-IN')}</p>
              </div>
              <button onClick={closePayModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type</label>
                <AddableSelect value={paymentType} onChange={setPaymentType} options={PAYMENT_TYPE_OPTIONS} placeholder="Select Payment Type" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button type="button" onClick={closePayModal} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={decide.isPending} onClick={confirmPayment} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {decide.isPending ? 'Confirming...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingReceipt?.attachmentUrl && (
        <ReceiptViewerModal url={viewingReceipt.attachmentUrl} name={viewingReceipt.attachmentName} onClose={() => setViewingReceipt(null)} />
      )}
    </div>
  );
}
