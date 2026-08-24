'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PencilIcon, ClockIcon, XCircleIcon, LinkIcon, MapPinIcon, UserPlusIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  MEETING_STATUSES,
  MEETING_PRIORITIES,
  PARTICIPANT_TYPES,
  PARTICIPANT_ROLES,
  isValidMeetingStatusTransition,
  MeetingStatus,
  MeetingPriority,
  ParticipantType,
} from '@/lib/meetings/constants';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
};

const RSVP_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
  TENTATIVE: 'bg-amber-100 text-amber-700',
};

const AGENDA_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  DISCUSSED: 'bg-green-100 text-green-700',
  DEFERRED: 'bg-amber-100 text-amber-700',
};

const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
function avatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

async function fetchMeeting(id: string) {
  const res = await fetch(`/api/meetings/${id}`);
  if (!res.ok) throw new Error('Failed to fetch meeting');
  return res.json();
}

async function fetchUsers() {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content || [];
}

function EditMeetingModal({ meeting, users, onClose }: { meeting: any; users: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: meeting.title || '',
    purpose: meeting.purpose || '',
    location: meeting.location || '',
    meetingLink: meeting.meetingLink || '',
    durationMinutes: meeting.durationMinutes != null ? String(meeting.durationMinutes) : '',
    priority: meeting.priority as MeetingPriority,
    organizerId: meeting.organizerId != null ? String(meeting.organizerId) : '',
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: meeting.version,
          title: form.title,
          purpose: form.purpose || null,
          location: form.location || null,
          meetingLink: form.meetingLink || null,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
          priority: form.priority,
          organizerId: form.organizerId ? Number(form.organizerId) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update meeting');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meeting.id)] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting updated');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Meeting</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Purpose</label>
            <textarea
              rows={3}
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as MeetingPriority }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {MEETING_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Duration (min)</label>
              <input
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Meeting Link</label>
            <input
              value={form.meetingLink}
              onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Organizer</label>
            <select
              value={form.organizerId}
              onChange={(e) => setForm((f) => ({ ...f, organizerId: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Unassigned</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => editMutation.mutate()}
            disabled={!form.title || editMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {editMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ meeting, onClose }: { meeting: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [scheduledAt, setScheduledAt] = useState(dayjs(meeting.scheduledAt).format('YYYY-MM-DDTHH:mm'));
  const [reason, setReason] = useState('');

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meeting.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: meeting.version, scheduledAt: new Date(scheduledAt).toISOString(), reason: reason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to reschedule meeting');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meeting.id)] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting rescheduled');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Reschedule Meeting</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">New Date &amp; Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Reason (optional)</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => scheduledAt && rescheduleMutation.mutate()}
            disabled={!scheduledAt || rescheduleMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {rescheduleMutation.isPending ? 'Rescheduling...' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelMeetingModal({ meeting, onClose }: { meeting: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meeting.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: meeting.version, reason: reason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to cancel meeting');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meeting.id)] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting cancelled');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Cancel Meeting</h2>
        <p className="text-sm text-slate-500 mb-4">This will mark &quot;{meeting.title}&quot; as cancelled. Are you sure?</p>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Reason (optional)</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Keep Meeting</button>
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-red-700"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddParticipantForm({ meetingId, users, onDone }: { meetingId: number; users: any[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [participantType, setParticipantType] = useState<ParticipantType>('INTERNAL');
  const [userId, setUserId] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [role, setRole] = useState('ATTENDEE');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meetingId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [
            participantType === 'INTERNAL'
              ? { participantType, userId: Number(userId), role }
              : { participantType, externalName, externalEmail: externalEmail || undefined, role },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add participant');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meetingId)] });
      toast.success('Participant added');
      setUserId('');
      setExternalName('');
      setExternalEmail('');
      onDone();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const canSubmit = participantType === 'INTERNAL' ? !!userId : !!externalName.trim();

  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        {PARTICIPANT_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setParticipantType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${participantType === t ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {participantType === 'INTERNAL' ? (
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2">
            <option value="">Select user</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder="Name"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <input
              value={externalEmail}
              onChange={(e) => setExternalEmail(e.target.value)}
              placeholder="Email (optional)"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </>
        )}
        <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          {PARTICIPANT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => addMutation.mutate()}
          disabled={!canSubmit || addMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add Participant'}
        </button>
      </div>
    </div>
  );
}

function AddAgendaItemForm({ meetingId, users, sortOrder, onDone }: { meetingId: number; users: any[]; sortOrder: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeAllocatedMinutes, setTimeAllocatedMinutes] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meetingId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || undefined,
          timeAllocatedMinutes: timeAllocatedMinutes ? Number(timeAllocatedMinutes) : undefined,
          ownerId: ownerId ? Number(ownerId) : undefined,
          sortOrder,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add agenda item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meetingId)] });
      toast.success('Agenda item added');
      setTitle('');
      setDescription('');
      setTimeAllocatedMinutes('');
      setOwnerId('');
      onDone();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Agenda item title"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min={0}
          value={timeAllocatedMinutes}
          onChange={(e) => setTimeAllocatedMinutes(e.target.value)}
          placeholder="Minutes allocated"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          <option value="">No owner</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => title.trim() && addMutation.mutate()}
          disabled={!title.trim() || addMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add Agenda Item'}
        </button>
      </div>
    </div>
  );
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { has: hasPermission } = usePermissions();
  const canManageMeetings = hasPermission('manage_meetings');

  const [showEditModal, setShowEditModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddAgendaItem, setShowAddAgendaItem] = useState(false);

  const { data: meeting, isLoading } = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => fetchMeeting(id),
  });

  const { data: users = [] } = useQuery({ queryKey: ['users-for-meetings'], queryFn: fetchUsers });

  const statusMutation = useMutation({
    mutationFn: async (status: MeetingStatus) => {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, version: meeting.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Status updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (isLoading) return <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />;
  if (!meeting) return <p className="text-slate-500">Meeting not found</p>;

  const availableStatuses = (MEETING_STATUSES as readonly MeetingStatus[]).filter(
    (s) => s === meeting.status || (s !== 'CANCELLED' && isValidMeetingStatusTransition(meeting.status, s))
  );
  const canCancel = isValidMeetingStatusTransition(meeting.status, 'CANCELLED');
  const canReschedule = meeting.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/dashboard/meetings')} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeftIcon className="h-4 w-4" /> Back to Meetings
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">{meeting.meetingType}</p>
            <h1 className="text-xl font-bold text-slate-800 mt-1">{meeting.title}</h1>
            {meeting.purpose && <p className="text-slate-600 mt-2">{meeting.purpose}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[meeting.priority] || 'bg-slate-100 text-slate-700'}`}>{meeting.priority}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[meeting.status] || 'bg-slate-100 text-slate-700'}`}>
              {meeting.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
          <div><p className="text-slate-400">Scheduled At</p><p className="font-medium text-slate-700">{dayjs(meeting.scheduledAt).format('DD MMM YYYY, h:mm A')}</p></div>
          <div><p className="text-slate-400">Duration</p><p className="font-medium text-slate-700">{meeting.durationMinutes ? `${meeting.durationMinutes} min` : '—'}</p></div>
          <div><p className="text-slate-400">Organizer</p><p className="font-medium text-slate-700">{meeting.organizerName || '—'}</p></div>
          <div><p className="text-slate-400">Created By</p><p className="font-medium text-slate-700">{meeting.createdByName || '—'}</p></div>
          <div className="flex items-start gap-1.5"><MapPinIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /><div><p className="text-slate-400">Location</p><p className="font-medium text-slate-700">{meeting.location || '—'}</p></div></div>
          <div className="flex items-start gap-1.5">
            <LinkIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-slate-400">Meeting Link</p>
              {meeting.meetingLink ? (
                <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="font-medium text-amber-600 hover:underline break-all">{meeting.meetingLink}</a>
              ) : (
                <p className="font-medium text-slate-700">—</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <label htmlFor="status-select" className="text-sm font-medium text-slate-600">Status</label>
            <select
              id="status-select"
              value={meeting.status}
              disabled={!canManageMeetings || statusMutation.isPending}
              onChange={(e) => statusMutation.mutate(e.target.value as MeetingStatus)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
            >
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}{s === meeting.status ? ' (current)' : ''}</option>
              ))}
            </select>
          </div>

          {canManageMeetings && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <PencilIcon className="h-4 w-4" /> Edit
              </button>
              {canReschedule && (
                <button
                  onClick={() => setShowRescheduleModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  <ClockIcon className="h-4 w-4" /> Reschedule
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100"
                >
                  <XCircleIcon className="h-4 w-4" /> Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Participants</h2>
          {canManageMeetings && (
            <button
              onClick={() => setShowAddParticipant((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <UserPlusIcon className="h-4 w-4" /> Add Participant
            </button>
          )}
        </div>
        {showAddParticipant && (
          <div className="mb-4">
            <AddParticipantForm meetingId={meeting.id} users={users} onDone={() => setShowAddParticipant(false)} />
          </div>
        )}
        {meeting.participants?.length ? (
          <ul className="divide-y divide-slate-100">
            {meeting.participants.map((p: any) => (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                    style={{ backgroundColor: p.userId ? avatarColor(p.userId) : '#94A3B8' }}
                  >
                    {initials(p.participantType === 'INTERNAL' ? p.userName || '?' : p.externalName || '?')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{p.participantType === 'INTERNAL' ? p.userName || 'Unknown user' : p.externalName}</p>
                    <p className="text-xs text-slate-400 truncate">{p.participantType === 'EXTERNAL' ? (p.externalEmail || 'External') : 'Internal'} · {p.role}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${RSVP_COLORS[p.rsvpStatus] || 'bg-slate-100 text-slate-700'}`}>{p.rsvpStatus}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No participants yet</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Agenda</h2>
          {canManageMeetings && (
            <button
              onClick={() => setShowAddAgendaItem((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <PlusIcon className="h-4 w-4" /> Add Agenda Item
            </button>
          )}
        </div>
        {showAddAgendaItem && (
          <div className="mb-4">
            <AddAgendaItemForm meetingId={meeting.id} users={users} sortOrder={meeting.agendaItems?.length || 0} onDone={() => setShowAddAgendaItem(false)} />
          </div>
        )}
        {meeting.agendaItems?.length ? (
          <ol className="space-y-3">
            {meeting.agendaItems.map((a: any, idx: number) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">{a.title}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${AGENDA_STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-700'}`}>{a.status}</span>
                  </div>
                  {a.description && <p className="text-sm text-slate-500 mt-0.5">{a.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {a.timeAllocatedMinutes ? `${a.timeAllocatedMinutes} min` : 'No time allocated'}
                    {a.ownerName ? ` · Owner: ${a.ownerName}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-400">No agenda items yet</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Activity</h2>
        {meeting.activities?.length ? (
          <ul className="space-y-3">
            {meeting.activities.map((a: any) => (
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

      {showEditModal && <EditMeetingModal meeting={meeting} users={users} onClose={() => setShowEditModal(false)} />}
      {showRescheduleModal && <RescheduleModal meeting={meeting} onClose={() => setShowRescheduleModal(false)} />}
      {showCancelModal && <CancelMeetingModal meeting={meeting} onClose={() => setShowCancelModal(false)} />}
    </div>
  );
}
