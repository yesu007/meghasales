'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { STATUSES, PRIORITIES, isValidStatusTransition, TicketStatus, Priority } from '@/lib/adminTicket/constants';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

async function fetchTicket(id: string) {
  const res = await fetch(`/api/admin-ticket/tickets/${id}`);
  if (!res.ok) throw new Error('Failed to fetch ticket');
  return res.json();
}

async function fetchComments(id: string) {
  const res = await fetch(`/api/admin-ticket/tickets/${id}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  return res.json();
}

export default function AdminTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [commentDraft, setCommentDraft] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['admin-ticket', id],
    queryFn: () => fetchTicket(id),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['admin-ticket-comments', id],
    queryFn: () => fetchComments(id),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: TicketStatus) => {
      const res = await fetch(`/api/admin-ticket/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, version: ticket.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Status updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const priorityMutation = useMutation({
    mutationFn: async (priority: Priority) => {
      const res = await fetch(`/api/admin-ticket/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority, version: ticket.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update priority');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Priority updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/admin-ticket/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Failed to add comment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket-comments', id] });
      setCommentDraft('');
      toast.success('Comment added');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin-ticket/tickets/${id}/attachments`, { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Upload failed');
      }
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] });
      toast.success('Attachment uploaded');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) return <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />;
  if (!ticket) return <p className="text-slate-500">Ticket not found</p>;

  const availableStatuses = (STATUSES as readonly TicketStatus[]).filter((s) => s === ticket.status || isValidStatusTransition(ticket.status, s));

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/dashboard/admin-ticket')} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeftIcon className="h-4 w-4" /> Back to Admin Tickets
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">{ticket.ticketNo} · {ticket.category?.name}</p>
            <h1 className="text-xl font-bold text-slate-800 mt-1">{ticket.title}</h1>
            {ticket.description && <p className="text-slate-600 mt-2">{ticket.description}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status] || 'bg-slate-100 text-slate-700'}`}>
            {ticket.status.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
          <div><p className="text-slate-400">Assigned To</p><p className="font-medium text-slate-700">{ticket.assignedToName || '—'}</p></div>
          <div><p className="text-slate-400">Due Date</p><p className="font-medium text-slate-700">{ticket.dueDate ? dayjs(ticket.dueDate).format('DD MMM YYYY') : '—'}</p></div>
          <div><p className="text-slate-400">Created By</p><p className="font-medium text-slate-700">{ticket.createdByName || '—'}</p></div>
          <div><p className="text-slate-400">Created On</p><p className="font-medium text-slate-700">{dayjs(ticket.createdAt).format('DD MMM YYYY')}</p></div>
        </div>

        <div className="flex flex-wrap items-center gap-6 mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <label htmlFor="status-select" className="text-sm font-medium text-slate-600">Status</label>
            <select
              id="status-select"
              value={ticket.status}
              disabled={statusMutation.isPending}
              onChange={(e) => statusMutation.mutate(e.target.value as TicketStatus)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
            >
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}{s === ticket.status ? ' (current)' : ''}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="priority-select" className="text-sm font-medium text-slate-600">Priority</label>
            <select
              id="priority-select"
              value={ticket.priority}
              disabled={priorityMutation.isPending}
              onChange={(e) => priorityMutation.mutate(e.target.value as Priority)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
            >
              {(PRIORITIES as readonly Priority[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Attachments</h2>
          <label className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer">
            <PaperClipIcon className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </label>
        </div>
        {ticket.attachments?.length ? (
          <ul className="divide-y divide-slate-100">
            {ticket.attachments.map((a: any) => (
              <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                <a href={a.filePath} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-amber-600">{a.fileName}</a>
                <span className="text-slate-400">{dayjs(a.createdAt).format('DD MMM YYYY')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No attachments yet</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Comments</h2>
        <div className="space-y-3 mb-4">
          {comments.length ? (
            comments.map((c: any) => (
              <div key={c.id} className="bg-slate-50 rounded-lg p-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
                <p className="text-xs text-slate-400 mt-1">{c.authorName || 'Unknown'} · {dayjs(c.createdAt).format('DD MMM YYYY, HH:mm')}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No comments yet</p>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Add a comment..."
            maxLength={4000}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button
            onClick={() => commentDraft.trim() && commentMutation.mutate(commentDraft.trim())}
            disabled={!commentDraft.trim() || commentMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 self-end"
          >
            {commentMutation.isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Activity</h2>
        {ticket.activities?.length ? (
          <ul className="space-y-3">
            {ticket.activities.map((a: any) => (
              <li key={a.id} className="text-sm">
                <span className="text-slate-700">{a.action.replace('_', ' ')}</span>
                {a.fieldName && <span className="text-slate-500"> — {a.fieldName}: {a.oldValue ?? '—'} → {a.newValue ?? '—'}</span>}
                {a.remarks && <span className="text-slate-500"> — {a.remarks}</span>}
                <span className="text-slate-400 ml-2">{dayjs(a.performedAt).format('DD MMM YYYY, HH:mm')} {a.performedByName ? `by ${a.performedByName}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No activity yet</p>
        )}
      </div>
    </div>
  );
}
