'use client';

import { useState, Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { FOLLOWUP_METHODS, FOLLOWUP_OUTCOMES, validateFollowUpInput } from '@/lib/leadFollowUp';

interface FollowUpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: number;
}

const blankForm = {
  followUpDate: dayjs().format('YYYY-MM-DD'),
  method: '',
  notes: '',
  outcome: '',
  nextAction: '',
  nextFollowUpDate: '',
};

export default function FollowUpDrawer({ isOpen, onClose, leadId }: FollowUpDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm);

  const close = () => { setForm(blankForm); onClose(); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateFollowUpInput(form);
      if (validationError) throw new Error(validationError);

      const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, nextFollowUpDate: form.nextFollowUpDate || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to log follow-up');
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['follow-ups', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success(result.statusUpdatedTo ? `Follow-up logged — status moved to ${result.statusUpdatedTo.replace(/_/g, ' ').toLowerCase()}` : 'Follow-up logged!');
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
              <Dialog.Panel className="w-screen max-w-lg">
                <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <Dialog.Title className="text-lg font-semibold text-slate-800">Add Follow-up</Dialog.Title>
                    <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="flex-1 px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                        <input required type="date" value={form.followUpDate} onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Method *</label>
                        <select required value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">Select</option>
                          {FOLLOWUP_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                      <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Outcome</label>
                      <select value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                        <option value="">Select</option>
                        {FOLLOWUP_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Next Action</label>
                      <textarea rows={2} value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Next Follow-up Date</label>
                      <input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm((f) => ({ ...f, nextFollowUpDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      <p className="text-xs text-slate-400 mt-1">Setting this moves the lead&apos;s status to &ldquo;Follow-up Scheduled&rdquo; (unless it&apos;s already further along).</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={close} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {saveMutation.isPending ? 'Saving...' : 'Log Follow-up'}
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
