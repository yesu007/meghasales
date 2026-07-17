'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { validateDiscussionInput } from '@/lib/eventValidation';
import DocumentUpload from './DocumentUpload';

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

interface AddDiscussionFormProps {
  leadId: number;
  eventId: number;
}

const blankForm = { notes: '', decisionsTaken: '', actionItems: '', assignedToId: '', targetDate: '' };

export default function AddDiscussionForm({ leadId, eventId }: AddDiscussionFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: users = [] } = useQuery({ queryKey: ['users-for-discussion'], queryFn: fetchUsers });

  const addMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateDiscussionInput(form);
      if (validationError) throw new Error(validationError);

      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, assignedToId: form.assignedToId || null, targetDate: form.targetDate || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to add discussion');
      }
      const discussion = await res.json();

      if (attachment) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', attachment);
        fd.append('discussionId', String(discussion.id));
        const uploadRes = await fetch(`/api/leads/${leadId}/events/${eventId}/documents`, { method: 'POST', body: fd });
        setUploading(false);
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          toast.error(`Attachment not uploaded: ${err.message}. Discussion was saved without it.`);
        }
      }

      return discussion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-discussions', eventId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success('Discussion added!');
      setForm(blankForm);
      setAttachment(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Discussion Notes *</label>
        <textarea required rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white" placeholder="What was discussed?" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Decisions Taken</label>
          <textarea rows={2} value={form.decisionsTaken} onChange={(e) => setForm((f) => ({ ...f, decisionsTaken: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Action Items</label>
          <textarea rows={2} value={form.actionItems} onChange={(e) => setForm((f) => ({ ...f, actionItems: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To</label>
          <select value={form.assignedToId} onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white">
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Target Date</label>
          <input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <DocumentUpload label={attachment ? attachment.name : 'Attach a file'} onFileSelected={setAttachment} />
        <button type="submit" disabled={addMutation.isPending || uploading} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
          {uploading ? 'Uploading...' : addMutation.isPending ? 'Saving...' : 'Add Discussion'}
        </button>
      </div>
    </form>
  );
}
