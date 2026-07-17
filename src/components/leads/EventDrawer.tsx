'use client';

import { useState, Fragment, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { EVENT_TYPES, validateEventInput } from '@/lib/eventValidation';

export const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETING: 'Meeting',
  PHONE_CALL: 'Phone Call',
  VIDEO_CALL: 'Video Call',
  CLIENT_VISIT: 'Client Visit',
  INTERNAL_DISCUSSION: 'Internal Discussion',
  FOLLOW_UP: 'Follow-up',
  REQUIREMENT_GATHERING: 'Requirement Gathering',
  DOCUMENT_REVIEW: 'Document Review',
  DEMO: 'Demo',
  OTHER: 'Other',
};

interface EventRecord {
  id: number;
  title: string;
  eventType: string;
  eventDateTime: string;
  duration: number | null;
  participants: string | null;
  location: string | null;
  meetingLink: string | null;
  description: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  status: string;
}

interface EventDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: number;
  event?: EventRecord | null;
}

const blankForm = {
  title: '', eventType: '', eventDateTime: '', duration: '', participants: '',
  location: '', meetingLink: '', description: '', nextAction: '', followUpDate: '', status: 'SCHEDULED',
};

export default function EventDrawer({ isOpen, onClose, leadId, event }: EventDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm);
  const isEditing = !!event;

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title,
        eventType: event.eventType,
        eventDateTime: dayjs(event.eventDateTime).format('YYYY-MM-DDTHH:mm'),
        duration: event.duration != null ? String(event.duration) : '',
        participants: event.participants || '',
        location: event.location || '',
        meetingLink: event.meetingLink || '',
        description: event.description || '',
        nextAction: event.nextAction || '',
        followUpDate: event.followUpDate ? dayjs(event.followUpDate).format('YYYY-MM-DD') : '',
        status: event.status,
      });
    } else {
      setForm(blankForm);
    }
  }, [event, isOpen]);

  const close = () => { setForm(blankForm); onClose(); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateEventInput({
        title: form.title,
        eventType: form.eventType,
        eventDateTime: form.eventDateTime,
        duration: form.duration ? Number(form.duration) : null,
        followUpDate: form.followUpDate || null,
        status: form.status,
      });
      if (validationError) throw new Error(validationError);

      const url = isEditing ? `/api/leads/${leadId}/events/${event!.id}` : `/api/leads/${leadId}/events`;
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          duration: form.duration ? Number(form.duration) : null,
          followUpDate: form.followUpDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save event');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success(isEditing ? 'Event updated!' : 'Event created!');
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
                    <Dialog.Title className="text-lg font-semibold text-slate-800">{isEditing ? 'Edit Event' : 'New Event'}</Dialog.Title>
                    <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="flex-1 px-6 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Event Title *</label>
                      <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Event Type *</label>
                        <select required value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">Select</option>
                          {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date &amp; Time *</label>
                        <input required type="datetime-local" value={form.eventDateTime} onChange={(e) => setForm((f) => ({ ...f, eventDateTime: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
                        <input type="number" min={1} value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      {isEditing && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="SCHEDULED">Scheduled</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Participants</label>
                      <input value={form.participants} onChange={(e) => setForm((f) => ({ ...f, participants: e.target.value }))} placeholder="Names, comma separated" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                        <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Link</label>
                        <input value={form.meetingLink} onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description / Notes</label>
                      <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Next Action</label>
                      <textarea rows={2} value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Follow-up Date</label>
                      <input type="date" value={form.followUpDate} onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={close} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {saveMutation.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Event'}
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
