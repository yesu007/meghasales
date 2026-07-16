'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, DocumentTextIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import PaymentEntryDrawer from '@/components/accounting/PaymentEntryDrawer';
import { formatCurrency } from '@/lib/currency';

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PENDING: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const REMINDER_LABELS: Record<string, string> = {
  UPCOMING_7D: 'Due in 7 Days',
  DUE_TODAY: 'Due Today',
  OVERDUE_3D: 'Overdue 3 Days',
  OVERDUE_7D: 'Overdue 7 Days',
  OVERDUE_15D: 'Overdue 15 Days',
  OVERDUE_30D: 'Overdue 30+ Days',
};

function fmt(amount: string | number, currencyCode = 'INR'): string {
  return formatCurrency(amount, currencyCode);
}

function computeDisplayStatus(status: string, dueDate: string): string {
  if (status === 'PENDING' || status === 'PARTIALLY_PAID') {
    if (new Date(dueDate) < new Date(new Date().toDateString())) return 'OVERDUE';
  }
  return status;
}

async function fetchInvoice(id: string) {
  const res = await fetch(`/api/accounting/invoices/${id}`);
  if (!res.ok) throw new Error('Failed to fetch invoice');
  return res.json();
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['accounting-invoice', id],
    queryFn: () => fetchInvoice(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-16">
        <DocumentTextIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Invoice not found</p>
        <Link href="/dashboard/accounting/pending-invoices" className="text-amber-600 hover:text-amber-700 text-sm mt-2 inline-block">← Back to Invoices</Link>
      </div>
    );
  }

  const displayStatus = computeDisplayStatus(invoice.status, invoice.dueDate);
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const currencyCode = invoice.currencyCode || 'INR';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/accounting/pending-invoices" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeftIcon className="h-5 w-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{invoice.invoiceNumber}</h1>
            <p className="text-slate-500 mt-1">{invoice.lead.companyName} — {invoice.lead.contactPerson}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[displayStatus] || 'bg-slate-100 text-slate-700'}`}>
            {displayStatus.replace(/_/g, ' ')}
          </span>
          {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
            <button onClick={() => setPaymentDrawerOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              <BanknotesIcon className="h-4 w-4" /> Record Payment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Line Items</h2>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-center">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((li: any, i: number) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-800">{li.description}</td>
                    <td className="py-2 text-center text-slate-600">{li.quantity}</td>
                    <td className="py-2 text-right text-slate-600">{fmt(li.unitPrice, currencyCode)}</td>
                    <td className="py-2 text-right font-medium text-slate-800">{fmt(li.total, currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700">{fmt(invoice.subtotal, currencyCode)}</span></div>
              {Number(invoice.discountAmount) > 0 && <div className="flex justify-between text-green-600"><span>Discount ({invoice.discountPercentage}%)</span><span>-{fmt(invoice.discountAmount, currencyCode)}</span></div>}
              {Number(invoice.taxAmount) > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="text-slate-700">{fmt(invoice.taxAmount, currencyCode)}</span></div>}
              <div className="flex justify-between text-base font-bold pt-1.5 border-t border-slate-200"><span className="text-slate-800">Total</span><span className="text-amber-700">{fmt(invoice.totalAmount, currencyCode)}</span></div>
              <div className="flex justify-between text-green-600"><span>Paid</span><span>{fmt(invoice.amountPaid, currencyCode)}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-slate-800">Balance Due</span><span className="text-slate-800">{fmt(invoice.balanceDue, currencyCode)}</span></div>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Payment History</h2>
            {invoice.payments?.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr className="text-left text-slate-500">
                    <th className="pb-2">Payment No</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2">Reference</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.payments.map((p: any) => (
                    <tr key={p.id}>
                      <td className="py-2 text-slate-800">{p.paymentNumber}</td>
                      <td className="py-2 text-slate-600">{dayjs(p.paymentDate).format('DD MMM YYYY')}</td>
                      <td className="py-2 text-slate-600">{p.paymentMethod}</td>
                      <td className="py-2 text-slate-600">{p.referenceNumber || '—'}</td>
                      <td className="py-2 text-right font-medium text-slate-800">{fmt(p.amount, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">No payments recorded yet</p>
            )}
          </div>

          {/* Reminder History */}
          {invoice.reminders?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Reminder History</h2>
              <div className="space-y-2">
                {invoice.reminders.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{REMINDER_LABELS[r.reminderType] || r.reminderType}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'FOLLOWED_UP' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status.replace('_', ' ')}</span>
                    <span className="text-slate-400">{dayjs(r.createdAt).format('DD MMM YYYY')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Details</h2>
            <div className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-slate-500">Invoice Date</span><span className="text-slate-800">{dayjs(invoice.invoiceDate).format('DD MMM YYYY')}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className="text-slate-800">{dayjs(invoice.dueDate).format('DD MMM YYYY')}</span></div>
              {invoice.quotation && <div className="flex justify-between"><span className="text-slate-500">Quotation</span><span className="text-slate-800">{invoice.quotation.quotationNumber}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Currency</span><span className="text-slate-800">{invoice.currencyCode}</span></div>
            </div>
            {invoice.notes && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Notes</p>
                <p className="text-sm text-slate-600">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <PaymentEntryDrawer
        isOpen={paymentDrawerOpen}
        onClose={() => setPaymentDrawerOpen(false)}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        balanceDue={Number(invoice.balanceDue)}
        currencyCode={currencyCode}
      />
    </div>
  );
}
