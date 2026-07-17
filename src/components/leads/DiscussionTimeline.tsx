'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaperClipIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddDiscussionForm from './AddDiscussionForm';

const COMPLETION_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

interface Attachment {
  id: number;
  fileName: string;
  versions: { fileUrl: string }[];
}

interface Discussion {
  id: number;
  notes: string;
  decisionsTaken: string | null;
  actionItems: string | null;
  targetDate: string | null;
  completionStatus: string;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
  assignedTo: { firstName: string; lastName: string } | null;
  attachments: Attachment[];
}

interface DiscussionTimelineProps {
  leadId: number;
  eventId: number;
  canAdd: boolean;
  canManage: boolean;
}

async function fetchDiscussions(leadId: number, eventId: number): Promise<Discussion[]> {
  const res = await fetch(`/api/leads/${leadId}/events/${eventId}/discussions`);
  if (!res.ok) throw new Error('Failed to load discussions');
  return res.json();
}

export default function DiscussionTimeline({ leadId, eventId, canAdd, canManage }: DiscussionTimelineProps) {
  const queryClient = useQueryClient();

  const { data: discussions = [], isLoading } = useQuery({
    queryKey: ['event-discussions', eventId],
    queryFn: () => fetchDiscussions(leadId, eventId),
  });

  const deleteMutation = useMutation({
    mutationFn: async (discussionId: number) => {
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/discussions/${discussionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete discussion');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-discussions', eventId] });
      toast.success('Discussion deleted');
    },
    onError: () => toast.error('Failed to delete discussion'),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase">Discussion Updates</p>
      {canAdd && <AddDiscussionForm leadId={leadId} eventId={eventId} />}
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading discussions...</p>
      ) : discussions.length === 0 ? (
        <p className="text-sm text-slate-400">No discussions yet.</p>
      ) : (
        <div className="space-y-2">
          {discussions.map((d) => (
            <div key={d.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-slate-800">{d.notes}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {d.author ? `${d.author.firstName} ${d.author.lastName}` : 'Unknown'} · {dayjs(d.createdAt).format('DD MMM YYYY, HH:mm')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COMPLETION_STYLES[d.completionStatus] || 'bg-slate-100 text-slate-700'}`}>
                    {d.completionStatus.replace('_', ' ')}
                  </span>
                  {canManage && (
                    <button onClick={() => { if (window.confirm('Delete this discussion?')) deleteMutation.mutate(d.id); }} className="p-1 text-slate-400 hover:text-red-600" title="Delete">
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {(d.decisionsTaken || d.actionItems) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs">
                  {d.decisionsTaken && <div><span className="font-medium text-slate-600">Decisions: </span><span className="text-slate-600">{d.decisionsTaken}</span></div>}
                  {d.actionItems && <div><span className="font-medium text-slate-600">Action Items: </span><span className="text-slate-600">{d.actionItems}</span></div>}
                </div>
              )}
              {(d.assignedTo || d.targetDate) && (
                <p className="text-xs text-slate-500 mt-1.5">
                  {d.assignedTo && <>Assigned to <strong>{d.assignedTo.firstName} {d.assignedTo.lastName}</strong>{d.targetDate ? ' · ' : ''}</>}
                  {d.targetDate && <>Target: {dayjs(d.targetDate).format('DD MMM YYYY')}</>}
                </p>
              )}
              {d.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.attachments.map((a) => (
                    <a key={a.id} href={a.versions[0]?.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline">
                      <PaperClipIcon className="h-3.5 w-3.5" /> {a.fileName}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
