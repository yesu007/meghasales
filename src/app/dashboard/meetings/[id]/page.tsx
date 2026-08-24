'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  PencilIcon,
  ClockIcon,
  XCircleIcon,
  LinkIcon,
  MapPinIcon,
  UserPlusIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  PaperAirplaneIcon,
  CheckIcon,
  XMarkIcon,
  RocketLaunchIcon,
  EyeIcon,
  PaperClipIcon,
  MicrophoneIcon,
  StopIcon,
  TrashIcon,
  UsersIcon,
  ListBulletIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  MEETING_STATUSES,
  MEETING_PRIORITIES,
  PARTICIPANT_TYPES,
  PARTICIPANT_ROLES,
  isValidMeetingStatusTransition,
  isMomContentEditable,
  MeetingStatus,
  MeetingPriority,
  ParticipantType,
  ACTION_ITEM_PRIORITIES,
  ActionItemPriority,
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

const MOM_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PUBLISHED: 'bg-amber-100 text-amber-700',
};

const ACTION_ITEM_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-cyan-100 text-cyan-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-orange-100 text-orange-700',
  BLOCKED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
  VERIFIED: 'bg-teal-100 text-teal-700',
  CLOSED: 'bg-slate-200 text-slate-600',
  CANCELLED: 'bg-slate-100 text-slate-400',
};

const ACTION_ITEM_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
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

async function fetchMomDetail(momId: number) {
  const res = await fetch(`/api/mom/${momId}`);
  if (!res.ok) throw new Error('Failed to fetch MOM detail');
  return res.json();
}

async function fetchMomAttachments(momId: number) {
  const res = await fetch(`/api/mom/${momId}/attachments`);
  if (!res.ok) throw new Error('Failed to fetch attachments');
  return res.json();
}

async function uploadMomAttachment(momId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/mom/${momId}/attachments`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Upload failed');
  }
  return res.json();
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extensionless, MIME-derived filename for a recorded voice note — the
// MediaRecorder's actual output container (webm/mp4/ogg) varies by browser
// (Safari can't record webm), so the extension has to follow whatever
// mimeType the recorder actually reports rather than being hardcoded.
function voiceNoteFileName(mimeType: string): string {
  const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  return `voice-note-${Date.now()}.${ext}`;
}

// Records a short voice note via MediaRecorder and hands the caller a File
// once stopped — used both by CreateMomModal (staged, uploaded after the
// MOM itself is created) and the persistent Attachments list (uploaded
// immediately). No dedicated recording UI exists elsewhere in this app, so
// this is the one place mic-permission/MediaRecorder wiring lives.
function VoiceRecorderButton({ onRecorded, disabled }: { onRecorded: (file: File) => void; disabled?: boolean }) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecorded(new File([blob], voiceNoteFileName(mimeType), { type: mimeType }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('Microphone permission denied or unavailable');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    stopTimer();
    setIsRecording(false);
  };

  if (isRecording) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100"
      >
        <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
        <StopIcon className="h-4 w-4" /> Stop ({mm}:{ss})
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
    >
      <MicrophoneIcon className="h-4 w-4" /> Record Voice Note
    </button>
  );
}

async function fetchActionItems(meetingId: number) {
  const res = await fetch(`/api/action-items?meetingId=${meetingId}&size=100`);
  if (!res.ok) throw new Error('Failed to fetch action items');
  return res.json();
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

function CreateMomModal({ meetingId, onClose }: { meetingId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState('');
  const [risksIssues, setRisksIssues] = useState('');
  // Staged client-side until the MOM itself exists — MeetingAttachment
  // needs a real momId, so files/recordings picked here are only actually
  // uploaded after the create call below succeeds.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const addStagedFile = (file: File) => setStagedFiles((files) => [...files, file]);
  const removeStagedFile = (index: number) => setStagedFiles((files) => files.filter((_, i) => i !== index));

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${meetingId}/mom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summary || undefined, risksIssues: risksIssues || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create MOM');
      }
      const mom = await res.json();

      let failedUploads = 0;
      for (const file of stagedFiles) {
        try {
          await uploadMomAttachment(mom.id, file);
        } catch {
          failedUploads += 1;
        }
      }

      return { mom, failedUploads };
    },
    onSuccess: ({ mom, failedUploads }) => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(meetingId)] });
      queryClient.invalidateQueries({ queryKey: ['mom-attachments', mom.id] });
      if (failedUploads > 0) {
        toast.error(`MOM created, but ${failedUploads} attachment(s) failed to upload — add them again from the MOM`);
      } else {
        toast.success('MOM draft created');
      }
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Create MOM</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Summary</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Risks / Issues</label>
            <textarea
              rows={3}
              value={risksIssues}
              onChange={(e) => setRisksIssues(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Attachments (optional)</label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                <PaperClipIcon className="h-4 w-4" /> Add File
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) addStagedFile(file);
                  }}
                />
              </label>
              <VoiceRecorderButton onRecorded={addStagedFile} />
            </div>
            {stagedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {stagedFiles.map((file, index) => (
                  <li key={index} className="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                    <span className="text-slate-700 truncate">{file.name}</span>
                    <button type="button" onClick={() => removeStagedFile(index)} className="text-slate-400 hover:text-red-600">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create MOM'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditMomModal({ mom, onClose }: { mom: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState(mom.summary || '');
  const [risksIssues, setRisksIssues] = useState(mom.risksIssues || '');

  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/mom/${mom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: mom.version, summary: summary || null, risksIssues: risksIssues || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update MOM');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(mom.meetingId)] });
      toast.success('MOM updated');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit MOM</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Summary</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Risks / Issues</label>
            <textarea
              rows={3}
              value={risksIssues}
              onChange={(e) => setRisksIssues(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => editMutation.mutate()}
            disabled={editMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {editMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddMomDecisionForm({ mom, onDone }: { mom: any; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [decisionText, setDecisionText] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/mom/${mom.id}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionText, sortOrder: mom.decisions?.length || 0 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add decision');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(mom.meetingId)] });
      toast.success('Decision added');
      setDecisionText('');
      onDone();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
      <textarea
        rows={2}
        value={decisionText}
        onChange={(e) => setDecisionText(e.target.value)}
        placeholder="Decision text"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <div className="flex justify-end">
        <button
          onClick={() => decisionText.trim() && addMutation.mutate()}
          disabled={!decisionText.trim() || addMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add Decision'}
        </button>
      </div>
    </div>
  );
}

function AddActionItemModal({
  meetingId,
  momId,
  users,
  otherActionItems,
  onClose,
}: {
  meetingId: number;
  momId: number | null;
  users: any[];
  otherActionItems: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [priority, setPriority] = useState<ActionItemPriority>('MEDIUM');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dependsOnActionItemId, setDependsOnActionItemId] = useState('');
  const [attachToMom, setAttachToMom] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          momId: attachToMom && momId ? momId : undefined,
          description,
          assignedToId: assignedToId ? Number(assignedToId) : undefined,
          assignedTeam: assignedTeam || undefined,
          priority,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          dueDate: new Date(dueDate).toISOString(),
          dependsOnActionItemId: dependsOnActionItemId ? Number(dependsOnActionItemId) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create action item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items', meetingId] });
      toast.success('Action item created');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Action Item</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Assign To</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="">Unassigned</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Assigned Team</label>
              <input
                value={assignedTeam}
                onChange={(e) => setAssignedTeam(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ActionItemPriority)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {ACTION_ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          {otherActionItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Depends On</label>
              <select
                value={dependsOnActionItemId}
                onChange={(e) => setDependsOnActionItemId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">No dependency</option>
                {otherActionItems.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.description}</option>
                ))}
              </select>
            </div>
          )}
          {momId != null && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={attachToMom} onChange={(e) => setAttachToMom(e.target.checked)} />
              Link this action item to the meeting&apos;s MOM
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!description.trim() || !dueDate || createMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Action Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MomApprovalModal({ mom, decision, onClose }: { mom: any; decision: 'APPROVED' | 'REJECTED'; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/mom/${mom.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: mom.version, decision, remarks: remarks || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to record MOM approval decision');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', String(mom.meetingId)] });
      toast.success(decision === 'APPROVED' ? 'MOM approved' : 'MOM rejected');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">{decision === 'APPROVED' ? 'Approve MOM' : 'Reject MOM'}</h2>
        <p className="text-sm text-slate-500 mb-4">
          {decision === 'APPROVED' ? 'This will approve the minutes of meeting.' : 'This will send the minutes of meeting back to draft.'}
        </p>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Remarks (optional)</label>
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className={`px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50 ${decision === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {approveMutation.isPending ? 'Saving...' : decision === 'APPROVED' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MomHistorySection({ momId }: { momId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: momDetail, isLoading } = useQuery({
    queryKey: ['mom-detail', momId],
    queryFn: () => fetchMomDetail(momId),
    enabled: expanded,
  });

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        <EyeIcon className="h-4 w-4" /> {expanded ? 'Hide history' : 'View history'}
      </button>
      {expanded && (
        <div className="mt-3">
          {isLoading ? (
            <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ) : momDetail?.versions?.length ? (
            <ul className="space-y-3">
              {momDetail.versions.map((v: any) => {
                const snapshot = v.contentSnapshot || {};
                return (
                  <li key={v.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-700">Version {v.versionNumber}</p>
                      <p className="text-xs text-slate-400">{dayjs(v.createdAt).format('DD MMM YYYY, HH:mm')} {v.editedByName ? `by ${v.editedByName}` : ''}</p>
                    </div>
                    {snapshot.summary && <p className="text-slate-600 mt-1"><span className="text-slate-400">Summary: </span>{snapshot.summary}</p>}
                    {snapshot.risksIssues && <p className="text-slate-600 mt-1"><span className="text-slate-400">Risks/Issues: </span>{snapshot.risksIssues}</p>}
                    {snapshot.decisions?.length ? (
                      <ul className="mt-1.5 list-disc list-inside text-slate-600">
                        {snapshot.decisions.map((d: any, idx: number) => (
                          <li key={idx}>{d.decisionText}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No prior versions</p>
          )}
        </div>
      )}
    </div>
  );
}

// Documents and voice-note recordings attached to a MOM — list is visible
// to anyone who can view the meeting; upload controls are gated on
// canManageMom, same as the rest of the MOM authoring actions. Attachments
// are append-only and not part of the optimistic-locked MOM content
// (Mom.version), so uploading doesn't require the MOM to be in an
// editable status.
function MomAttachmentsSection({ momId, canUpload }: { momId: number; canUpload: boolean }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['mom-attachments', momId],
    queryFn: () => fetchMomAttachments(momId),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadMomAttachment(momId, file);
      queryClient.invalidateQueries({ queryKey: ['mom-attachments', momId] });
      toast.success('Attachment uploaded');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-600">Attachments</p>
        {canUpload && (
          <div className="flex items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <PaperClipIcon className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
            </label>
            <VoiceRecorderButton disabled={uploading} onRecorded={handleUpload} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
      ) : attachments.length ? (
        <ul className="divide-y divide-slate-100">
          {attachments.map((a: any) => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              {a.mimeType?.startsWith('audio/') ? (
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 truncate">{a.fileName}</p>
                  <audio controls src={a.filePath} className="mt-1 h-8 w-full max-w-xs" />
                </div>
              ) : (
                <a href={a.filePath} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-amber-600 truncate">
                  {a.fileName}
                </a>
              )}
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {formatFileSize(a.size)} {a.uploadedByName ? `· ${a.uploadedByName}` : ''} · {dayjs(a.createdAt).format('DD MMM YYYY')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No attachments yet</p>
      )}
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
  const canManageMom = hasPermission('manage_mom');
  const canApproveMom = hasPermission('approve_mom');
  const canPublishMom = hasPermission('publish_mom');
  const canAssignActionItems = hasPermission('assign_action_items');

  const [showEditModal, setShowEditModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddAgendaItem, setShowAddAgendaItem] = useState(false);
  const [showCreateMomModal, setShowCreateMomModal] = useState(false);
  const [showEditMomModal, setShowEditMomModal] = useState(false);
  const [showAddDecision, setShowAddDecision] = useState(false);
  const [momApprovalDecision, setMomApprovalDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [showAddActionItem, setShowAddActionItem] = useState(false);
  const [activeTab, setActiveTab] = useState<'participants' | 'agenda' | 'mom' | 'actions' | 'activity'>('participants');

  const { data: meeting, isLoading } = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => fetchMeeting(id),
  });

  const { data: users = [] } = useQuery({ queryKey: ['users-for-meetings'], queryFn: fetchUsers });

  const { data: actionItemsData } = useQuery({
    queryKey: ['action-items', meeting?.id],
    queryFn: () => fetchActionItems(meeting.id),
    enabled: !!meeting?.id,
  });
  const actionItems = actionItemsData?.content || [];

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

  const submitMomMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/mom/${meeting.mom.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: meeting.mom.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to submit MOM');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
      toast.success('MOM submitted for approval');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const publishMomMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/mom/${meeting.mom.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: meeting.mom.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to publish MOM');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] });
      toast.success('MOM published');
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

      <div className="bg-slate-100 rounded-xl p-1 inline-flex gap-1 flex-wrap">
        {(
          [
            { id: 'participants', label: 'Participants', icon: UsersIcon },
            { id: 'agenda', label: 'Agenda', icon: ListBulletIcon },
            { id: 'mom', label: 'MOM', icon: ClipboardDocumentListIcon },
            { id: 'actions', label: 'Actions', icon: CheckCircleIcon },
            { id: 'activity', label: 'Activity', icon: EyeIcon },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'participants' && (
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
      )}

      {activeTab === 'agenda' && (
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
      )}

      {activeTab === 'mom' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Minutes of Meeting</h2>
          {!meeting.mom && canManageMom && (
            <button
              onClick={() => setShowCreateMomModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <ClipboardDocumentListIcon className="h-4 w-4" /> Create MOM
            </button>
          )}
        </div>

        {!meeting.mom ? (
          <p className="text-sm text-slate-400">No MOM created yet</p>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${MOM_STATUS_COLORS[meeting.mom.status] || 'bg-slate-100 text-slate-700'}`}>
                {meeting.mom.status}
              </span>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {isMomContentEditable(meeting.mom.status) && canManageMom && (
                  <>
                    <button
                      onClick={() => setShowEditMomModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <PencilIcon className="h-4 w-4" /> Edit
                    </button>
                    <button
                      onClick={() => setShowAddDecision((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      <PlusIcon className="h-4 w-4" /> Add Decision
                    </button>
                    <button
                      onClick={() => submitMomMutation.mutate()}
                      disabled={submitMomMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" /> {submitMomMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  </>
                )}
                {meeting.mom.status === 'SUBMITTED' && canApproveMom && (
                  <>
                    <button
                      onClick={() => setMomApprovalDecision('APPROVED')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      <CheckIcon className="h-4 w-4" /> Approve
                    </button>
                    <button
                      onClick={() => setMomApprovalDecision('REJECTED')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      <XMarkIcon className="h-4 w-4" /> Reject
                    </button>
                  </>
                )}
                {meeting.mom.status === 'APPROVED' && canPublishMom && (
                  <button
                    onClick={() => publishMomMutation.mutate()}
                    disabled={publishMomMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <RocketLaunchIcon className="h-4 w-4" /> {publishMomMutation.isPending ? 'Publishing...' : 'Publish'}
                  </button>
                )}
              </div>
            </div>

            {showAddDecision && isMomContentEditable(meeting.mom.status) && canManageMom && (
              <div className="mt-4">
                <AddMomDecisionForm mom={meeting.mom} onDone={() => setShowAddDecision(false)} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="text-slate-400">Summary</p>
                <p className="font-medium text-slate-700 whitespace-pre-wrap">{meeting.mom.summary || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">Risks / Issues</p>
                <p className="font-medium text-slate-700 whitespace-pre-wrap">{meeting.mom.risksIssues || '—'}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-600 mb-2">Decisions</p>
              {meeting.mom.decisions?.length ? (
                <ul className="space-y-2">
                  {meeting.mom.decisions.map((d: any) => (
                    <li key={d.id} className="text-sm bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-700">{d.decisionText}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {d.decidedByName ? `Decided by ${d.decidedByName}` : ''} {d.decidedByName ? '·' : ''} {dayjs(d.createdAt).format('DD MMM YYYY, HH:mm')}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No decisions recorded yet</p>
              )}
            </div>

            <MomAttachmentsSection momId={meeting.mom.id} canUpload={canManageMom} />

            {meeting.mom.status === 'PUBLISHED' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div><p className="text-slate-400">Approved By</p><p className="font-medium text-slate-700">{meeting.mom.approvedByName || '—'}{meeting.mom.approvedAt ? ` on ${dayjs(meeting.mom.approvedAt).format('DD MMM YYYY, HH:mm')}` : ''}</p></div>
                <div><p className="text-slate-400">Published At</p><p className="font-medium text-slate-700">{meeting.mom.publishedAt ? dayjs(meeting.mom.publishedAt).format('DD MMM YYYY, HH:mm') : '—'}</p></div>
              </div>
            )}

            <MomHistorySection momId={meeting.mom.id} />
          </div>
        )}
      </div>
      )}

      {activeTab === 'actions' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Action Items</h2>
          {canAssignActionItems && (
            <button
              onClick={() => setShowAddActionItem(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <PlusIcon className="h-4 w-4" /> Add Action Item
            </button>
          )}
        </div>
        {actionItems.length ? (
          <ul className="divide-y divide-slate-100">
            {actionItems.map((a: any) => (
              <li
                key={a.id}
                onClick={() => router.push(`/dashboard/action-items/${a.id}`)}
                className="py-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50 rounded-lg px-2 -mx-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{a.description}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.assignedToName ? `Assigned to ${a.assignedToName}` : 'Unassigned'} · Due {dayjs(a.dueDate).format('DD MMM YYYY')}
                    {a.dependsOn && (
                      <span className="text-amber-600"> · Depends on &quot;{a.dependsOn.description}&quot; ({a.dependsOn.status})</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${ACTION_ITEM_PRIORITY_COLORS[a.priority] || 'bg-slate-100 text-slate-700'}`}>{a.priority}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${ACTION_ITEM_STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-700'}`}>{a.status.replace('_', ' ')}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No action items yet</p>
        )}
      </div>
      )}

      {activeTab === 'activity' && (
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
      )}

      {showEditModal && <EditMeetingModal meeting={meeting} users={users} onClose={() => setShowEditModal(false)} />}
      {showRescheduleModal && <RescheduleModal meeting={meeting} onClose={() => setShowRescheduleModal(false)} />}
      {showCancelModal && <CancelMeetingModal meeting={meeting} onClose={() => setShowCancelModal(false)} />}
      {showCreateMomModal && <CreateMomModal meetingId={meeting.id} onClose={() => setShowCreateMomModal(false)} />}
      {showEditMomModal && meeting.mom && <EditMomModal mom={{ ...meeting.mom, meetingId: meeting.id }} onClose={() => setShowEditMomModal(false)} />}
      {momApprovalDecision && meeting.mom && (
        <MomApprovalModal
          mom={{ ...meeting.mom, meetingId: meeting.id }}
          decision={momApprovalDecision}
          onClose={() => setMomApprovalDecision(null)}
        />
      )}
      {showAddActionItem && (
        <AddActionItemModal
          meetingId={meeting.id}
          momId={meeting.mom?.id ?? null}
          users={users}
          otherActionItems={actionItems}
          onClose={() => setShowAddActionItem(false)}
        />
      )}
    </div>
  );
}
