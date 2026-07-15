'use client';

import { useState, Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'OTHER', label: 'Other' },
];

function fmt(amount: number, symbol = '₹'): string {
  return `${symbol} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PaymentEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  invoiceNumber: string;
  balanceDue: number;
  currencySymbol?: string;
}

export default function PaymentEntryDrawer({ isOpen, onClose, invoiceId, invoiceNumber, balanceDue, currencySymbol = '₹' }: PaymentEntryDrawerProps) {
  const queryClient = useQueryClient();
  const blankForm = { amount: '', paymentDate: dayjs().format('YYYY-MM-DD'), paymentMethod: '', referenceNumber: '', notes: '' };
  const [form, setForm] = useState(blankForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setForm(blankForm); setAttachment(null); };
  const close = () => { reset(); onClose(); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!amount || amount <= 0) throw new Error('Enter a valid payment amount');
      if (amount > balanceDue) throw new Error(`Payment cannot exceed the outstanding balance of ${fmt(balanceDue, currencySymbol)}`);

      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      if (attachment) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', attachment);
        const uploadRes = await fetch('/api/accounting/upload', { method: 'POST', body: fd });
        setUploading(false);
        if (uploadRes.ok) {
          const uploaded = await uploadRes.json();
          attachmentUrl = uploaded.url;
          attachmentName = uploaded.name;
        } else {
          const err = await uploadRes.json();
          toast.error(`Attachment not uploaded: ${err.message}. Recording payment without it.`);
        }
      }

      const res = await fetch('/api/accounting/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          amount,
          paymentDate: form.paymentDate,
          paymentMethod: form.paymentMethod,
          referenceNumber: form.referenceNumber || undefined,
          notes: form.notes || undefined,
          attachmentUrl,
          attachmentName,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to record payment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoice', String(invoiceId)] });
      toast.success('Payment recorded!');
      close();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={close}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-hidden">
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
              <Dialog.Panel className="w-screen max-w-md">
                <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-slate-800">Record Payment</Dialog.Title>
                      <p className="text-xs text-slate-500 mt-0.5">{invoiceNumber} · Balance: {fmt(balanceDue, currencySymbol)}</p>
                    </div>
                    <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="flex-1 px-6 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payment Amount *</label>
                      <input required type="number" min={0.01} max={balanceDue} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" placeholder={`Up to ${fmt(balanceDue, currencySymbol)}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                        <input required type="date" value={form.paymentDate} onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Method *</label>
                        <select required value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">Select method</option>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                      <input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} placeholder="Transaction / cheque number" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Attachment</label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-amber-400 hover:text-amber-600">
                        <PaperClipIcon className="h-4 w-4" />
                        {attachment ? attachment.name : 'Attach receipt / proof of payment'}
                        <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] || null)} accept="image/*,.pdf" />
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                      <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={close} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={saveMutation.isPending || uploading} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {uploading ? 'Uploading...' : saveMutation.isPending ? 'Saving...' : 'Record Payment'}
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
