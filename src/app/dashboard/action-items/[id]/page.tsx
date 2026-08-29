'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  ArrowLeftIcon,
  PencilIcon,
  UserPlusIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  BellAlertIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  ACTION_ITEM_STATUSES,
  ACTION_ITEM_PRIORITIES,
  FOLLOWUP_FREQUENCIES,
  isValidActionItemStatusTransition,
  getActionItemTransitionCapability,
  ActionItemStatus,
  ActionItemPriority,
  FollowUpFrequency,
} from '@/lib/meetings/constants';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_COLORS: Record<string, string> = {
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

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const FOLLOWUP_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

const TERMINAL_OR_CLOSING_STATUSES = ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'];

const STATUS_BUTTON_COLORS: Record<string, string> = {
  ACCEPTED: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  PENDING: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
  BLOCKED: 'bg-red-50 text-red-700 hover:bg-red-100',
  COMPLETED: 'bg-green-50 text-green-700 hover:bg-green-100',
  VERIFIED: 'bg-teal-50 text-teal-700 hover:bg-teal-100',
  CLOSED: 'bg-amber-600 text-white hover:bg-amber-700',
  CANCELLED: 'bg-red-50 text-red-700 hover:bg-red-100',
};

// Target-status labels for the generic status-transition action bar. The
// COMPLETED->IN_PROGRESS edge (verifier rejecting a completion claim) is
// distinguished from the generic "move into IN_PROGRESS" OWNER action —
// same from/to-dependent naming used by getActionItemTransitionCapability.
function getStatusActionLabel(from: string, to: string): string {
  if (from === 'COMPLETED' && to === 'IN_PROGRESS') return 'Reject to In Progress';
  const labels: Record<string, string> = {
    ACCEPTED: 'Accept',
    IN_PROGRESS: 'Start Progress',
    PENDING: 'Mark Pending',
    BLOCKED: 'Mark Blocked',
    COMPLETED: 'Mark Complete',
    VERIFIED: 'Verify',
    CLOSED: 'Close',
    CANCELLED: 'Cancel',
  };
  return labels[to] || to;
}

async function fetchActionItem(id: string) {
  const res = await fetch(`/api/action-items/${id}`);
  if (!res.ok) throw new Error('Failed to fetch action item');
  return res.json();
}

async function fetchUsers() {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content || [];
}

async function fetchMeetingActionItems(meetingId: number) {
  const res = await fetch(`/api/action-items?meetingId=${meetingId}&size=100`);
  if (!res.ok) return { content: [] };
  return res.json();
}

function currentUserIdFromSession(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

function StatusChangeModal({
  actionItem,
  toStatus,
  label,
  onClose,
}: {
  actionItem: any;
  toStatus: ActionItemStatus;
  label: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const statusMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItem.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: actionItem.version, toStatus, remarks: remarks || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItem.id)] });
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      toast.success(`Status updated to ${toStatus.replace('_', ' ')}`);
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">{label}</h2>
        <p className="text-sm text-slate-500 mb-4">
          This will move the action item from <span className="font-medium">{actionItem.status.replace('_', ' ')}</span> to{' '}
          <span className="font-medium">{toStatus.replace('_', ' ')}</span>.
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
            onClick={() => statusMutation.mutate()}
            disabled={statusMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {statusMutation.isPending ? 'Saving...' : label}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignActionItemModal({ actionItem, users, onClose }: { actionItem: any; users: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [assignedToId, setAssignedToId] = useState(actionItem.assignedToId != null ? String(actionItem.assignedToId) : '');

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItem.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: actionItem.version, assignedToId: Number(assignedToId) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to assign action item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItem.id)] });
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      toast.success('Action item assigned');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">{actionItem.assignedToId ? 'Reassign' : 'Assign'} Action Item</h2>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Assign To</label>
          <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">Select user</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!assignedToId || assignMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {assignMutation.isPending ? 'Saving...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditActionItemModal({ actionItem, otherActionItems, onClose }: { actionItem: any; otherActionItems: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    description: actionItem.description || '',
    assignedTeam: actionItem.assignedTeam || '',
    priority: actionItem.priority as ActionItemPriority,
    startDate: actionItem.startDate ? dayjs(actionItem.startDate).format('YYYY-MM-DD') : '',
    dueDate: actionItem.dueDate ? dayjs(actionItem.dueDate).format('YYYY-MM-DD') : '',
    dependsOnActionItemId: actionItem.dependsOnActionItemId != null ? String(actionItem.dependsOnActionItemId) : '',
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: actionItem.version,
          description: form.description,
          assignedTeam: form.assignedTeam || null,
          priority: form.priority,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          dependsOnActionItemId: form.dependsOnActionItemId ? Number(form.dependsOnActionItemId) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update action item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItem.id)] });
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      toast.success('Action item updated');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Action Item</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Assigned Team</label>
              <input
                value={form.assignedTeam}
                onChange={(e) => setForm((f) => ({ ...f, assignedTeam: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ActionItemPriority }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {ACTION_ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Depends On</label>
            <select
              value={form.dependsOnActionItemId}
              onChange={(e) => setForm((f) => ({ ...f, dependsOnActionItemId: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">No dependency</option>
              {otherActionItems.map((a: any) => (
                <option key={a.id} value={a.id}>{a.description}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => editMutation.mutate()}
            disabled={!form.description.trim() || !form.dueDate || editMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {editMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenActionItemModal({ actionItem, onClose }: { actionItem: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItem.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: actionItem.version, remarks: remarks || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to reopen action item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItem.id)] });
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      toast.success('Action item reopened');
      onClose();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Reopen Action Item</h2>
        <p className="text-sm text-slate-500 mb-4">This will bring the action item back into an active status.</p>
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
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {reopenMutation.isPending ? 'Reopening...' : 'Reopen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCommentForm({ actionItemId }: { actionItemId: number }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItemId}/comments`, {
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
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItemId)] });
      setBody('');
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <div className="flex justify-end">
        <button
          onClick={() => body.trim() && addMutation.mutate()}
          disabled={!body.trim() || addMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {addMutation.isPending ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
    </div>
  );
}

function AddFollowUpForm({ actionItemId, users, onDone }: { actionItemId: number; users: any[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [followUpDate, setFollowUpDate] = useState('');
  const [frequency, setFrequency] = useState<FollowUpFrequency>('ONE_TIME');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [remarks, setRemarks] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/${actionItemId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpDate: new Date(followUpDate).toISOString(),
          frequency,
          nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate).toISOString() : undefined,
          ownerId: ownerId ? Number(ownerId) : undefined,
          remarks: remarks || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to add follow-up');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItemId)] });
      toast.success('Follow-up added');
      setFollowUpDate('');
      setNextFollowUpDate('');
      setOwnerId('');
      setRemarks('');
      onDone();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Follow-up Date</label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as FollowUpFrequency)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            {FOLLOWUP_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Next Follow-up (optional)</label>
          <input
            type="date"
            value={nextFollowUpDate}
            onChange={(e) => setNextFollowUpDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          <option value="">Owner: me</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Remarks (optional)"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => followUpDate && addMutation.mutate()}
          disabled={!followUpDate || addMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add Follow-up'}
        </button>
      </div>
    </div>
  );
}

function CompleteFollowUpButton({ followUpId, actionItemId }: { followUpId: number; actionItemId: number }) {
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/action-items/followups/${followUpId}/complete`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to complete follow-up');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-item', String(actionItemId)] });
      toast.success('Follow-up completed');
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <button
      onClick={() => completeMutation.mutate()}
      disabled={completeMutation.isPending}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
    >
      <CheckIcon className="h-3 w-3" /> {completeMutation.isPending ? 'Saving...' : 'Mark Done'}
    </button>
  );
}

export default function ActionItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session } = useSession();
  const currentUserId = currentUserIdFromSession(session);
  const { has: hasPermission } = usePermissions();
  const canAssign = hasPermission('assign_action_items');
  const canManageOwn = hasPermission('manage_own_action_items');
  const canVerify = hasPermission('verify_action_items');
  const canClose = hasPermission('close_action_items');
  const canReopen = hasPermission('reopen_action_items');

  const [statusModal, setStatusModal] = useState<{ toStatus: ActionItemStatus; label: string } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);

  const { data: actionItem, isLoading } = useQuery({
    queryKey: ['action-item', id],
    queryFn: () => fetchActionItem(id),
  });

  const { data: users = [] } = useQuery({ queryKey: ['users-for-meetings'], queryFn: fetchUsers });

  const { data: meetingActionItemsData } = useQuery({
    queryKey: ['action-items-for-meeting', actionItem?.meetingId],
    queryFn: () => fetchMeetingActionItems(actionItem.meetingId),
    enabled: !!actionItem?.meetingId,
  });
  const otherActionItems = (meetingActionItemsData?.content || []).filter((a: any) => a.id !== actionItem?.id);

  if (isLoading) return <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />;
  if (!actionItem) return <p className="text-slate-500">Action item not found</p>;

  const isOwner = currentUserId != null && actionItem.assignedToId === currentUserId;

  const statusButtons = (ACTION_ITEM_STATUSES as readonly string[])
    .filter((s) => s !== 'ASSIGNED' && isValidActionItemStatusTransition(actionItem.status, s as ActionItemStatus))
    .map((s) => {
      const capability = getActionItemTransitionCapability(actionItem.status, s as ActionItemStatus);
      const allowed =
        capability === 'ASSIGN' || capability === 'CANCEL'
          ? canAssign
          : capability === 'VERIFY'
            ? canVerify
            : capability === 'CLOSE'
              ? canClose
              : capability === 'OWNER'
                ? (canManageOwn && isOwner) || canAssign
                : false;
      return { toStatus: s as ActionItemStatus, allowed, label: getStatusActionLabel(actionItem.status, s) };
    })
    .filter((b) => b.allowed);

  const canAssignNow = canAssign && !TERMINAL_OR_CLOSING_STATUSES.includes(actionItem.status);
  const canReopenNow = canReopen && (actionItem.status === 'CLOSED' || actionItem.status === 'CANCELLED');

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push(`/dashboard/todo/${actionItem.meetingId}`)}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back to Meeting
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Action Item</p>
            <h1 className="text-xl font-bold text-slate-800 mt-1">{actionItem.description}</h1>
            {actionItem.meeting && (
              <p className="text-sm text-slate-500 mt-2">
                Meeting:{' '}
                <Link href={`/dashboard/todo/${actionItem.meetingId}`} className="text-amber-600 hover:underline">
                  {actionItem.meeting.title}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[actionItem.priority] || 'bg-slate-100 text-slate-700'}`}>{actionItem.priority}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[actionItem.status] || 'bg-slate-100 text-slate-700'}`}>
              {actionItem.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
          <div><p className="text-slate-400">Assigned To</p><p className="font-medium text-slate-700">{actionItem.assignedToName || '—'}</p></div>
          <div><p className="text-slate-400">Assigned Team</p><p className="font-medium text-slate-700">{actionItem.assignedTeam || '—'}</p></div>
          <div><p className="text-slate-400">Start Date</p><p className="font-medium text-slate-700">{actionItem.startDate ? dayjs(actionItem.startDate).format('DD MMM YYYY') : '—'}</p></div>
          <div><p className="text-slate-400">Due Date</p><p className="font-medium text-slate-700">{dayjs(actionItem.dueDate).format('DD MMM YYYY')}</p></div>
          <div><p className="text-slate-400">Created By</p><p className="font-medium text-slate-700">{actionItem.createdByName || '—'}</p></div>
          {actionItem.status === 'COMPLETED' || actionItem.status === 'VERIFIED' || actionItem.status === 'CLOSED' ? (
            <div><p className="text-slate-400">Completed By</p><p className="font-medium text-slate-700">{actionItem.completedByName || '—'}{actionItem.completedAt ? ` on ${dayjs(actionItem.completedAt).format('DD MMM YYYY')}` : ''}</p></div>
          ) : null}
          {actionItem.status === 'VERIFIED' || actionItem.status === 'CLOSED' ? (
            <div><p className="text-slate-400">Verified By</p><p className="font-medium text-slate-700">{actionItem.verifiedByName || '—'}{actionItem.verifiedAt ? ` on ${dayjs(actionItem.verifiedAt).format('DD MMM YYYY')}` : ''}</p></div>
          ) : null}
        </div>

        {(actionItem.dependsOn || actionItem.dependents?.length) && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-sm space-y-1">
            {actionItem.dependsOn && (
              <p className="text-slate-600">
                Depends on:{' '}
                <Link href={`/dashboard/action-items/${actionItem.dependsOn.id}`} className="text-amber-600 hover:underline">
                  {actionItem.dependsOn.description}
                </Link>{' '}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[actionItem.dependsOn.status] || 'bg-slate-100 text-slate-700'}`}>{actionItem.dependsOn.status}</span>
              </p>
            )}
            {actionItem.dependents?.length ? (
              <div className="text-slate-600">
                Blocking:
                <ul className="list-disc list-inside mt-1">
                  {actionItem.dependents.map((d: any) => (
                    <li key={d.id}>
                      <Link href={`/dashboard/action-items/${d.id}`} className="text-amber-600 hover:underline">{d.description}</Link>{' '}
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-slate-100 text-slate-700'}`}>{d.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {actionItem.closureRemarks && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
            <p className="text-slate-400">Closure Remarks</p>
            <p className="font-medium text-slate-700 whitespace-pre-wrap">{actionItem.closureRemarks}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t border-slate-100">
          {statusButtons.map((b) => (
            <button
              key={b.toStatus}
              onClick={() => setStatusModal({ toStatus: b.toStatus, label: b.label })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${STATUS_BUTTON_COLORS[b.toStatus] || 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {b.label}
            </button>
          ))}
          {canAssignNow && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              <UserPlusIcon className="h-4 w-4" /> {actionItem.assignedToId ? 'Reassign' : 'Assign'}
            </button>
          )}
          {canAssign && (
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <PencilIcon className="h-4 w-4" /> Edit
            </button>
          )}
          {canReopenNow && (
            <button
              onClick={() => setShowReopenModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <ArrowPathIcon className="h-4 w-4" /> Reopen
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-3 inline-flex items-center gap-1.5"><ChatBubbleLeftRightIcon className="h-4 w-4" /> Comments</h2>
        <div className="mb-4">
          <AddCommentForm actionItemId={actionItem.id} />
        </div>
        {actionItem.comments?.length ? (
          <ul className="space-y-3">
            {actionItem.comments.map((c: any) => (
              <li key={c.id} className="text-sm bg-slate-50 rounded-lg p-3">
                <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
                <p className="text-xs text-slate-400 mt-1">{c.authorName || 'Unknown'} · {dayjs(c.createdAt).format('DD MMM YYYY, HH:mm')}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No comments yet</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800 inline-flex items-center gap-1.5"><BellAlertIcon className="h-4 w-4" /> Follow-ups</h2>
          {(canManageOwn || canAssign) && (
            <button
              onClick={() => setShowAddFollowUp((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              Add Follow-up
            </button>
          )}
        </div>
        {showAddFollowUp && (
          <div className="mb-4">
            <AddFollowUpForm actionItemId={actionItem.id} users={users} onDone={() => setShowAddFollowUp(false)} />
          </div>
        )}
        {actionItem.followUps?.length ? (
          <ul className="space-y-2">
            {actionItem.followUps.map((f: any) => (
              <li key={f.id} className="text-sm bg-slate-50 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-slate-700">
                    {dayjs(f.followUpDate).format('DD MMM YYYY')} · {f.frequency}
                    {f.nextFollowUpDate ? ` · Next: ${dayjs(f.nextFollowUpDate).format('DD MMM YYYY')}` : ''}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {f.ownerName ? `Owner: ${f.ownerName}` : ''}
                    {f.remarks ? ` · ${f.remarks}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${FOLLOWUP_STATUS_COLORS[f.status] || 'bg-slate-100 text-slate-700'}`}>{f.status}</span>
                  {f.status === 'PENDING' && (canManageOwn || canAssign) && (
                    <CompleteFollowUpButton followUpId={f.id} actionItemId={actionItem.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No follow-ups yet</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Activity</h2>
        {actionItem.history?.length ? (
          <ul className="space-y-3">
            {actionItem.history.map((h: any) => (
              <li key={h.id} className="text-sm">
                <span className="text-slate-700">{h.action.replace('_', ' ')}</span>
                {h.fieldName && <span className="text-slate-500"> — {h.fieldName}: {h.oldValue ?? '—'} → {h.newValue ?? '—'}</span>}
                {h.remarks && <span className="text-slate-500"> — {h.remarks}</span>}
                <span className="text-slate-400 ml-2">{dayjs(h.performedAt).format('DD MMM YYYY, HH:mm')} {h.performedByName ? `by ${h.performedByName}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No activity yet</p>
        )}
      </div>

      {statusModal && (
        <StatusChangeModal
          actionItem={actionItem}
          toStatus={statusModal.toStatus}
          label={statusModal.label}
          onClose={() => setStatusModal(null)}
        />
      )}
      {showAssignModal && <AssignActionItemModal actionItem={actionItem} users={users} onClose={() => setShowAssignModal(false)} />}
      {showEditModal && <EditActionItemModal actionItem={actionItem} otherActionItems={otherActionItems} onClose={() => setShowEditModal(false)} />}
      {showReopenModal && <ReopenActionItemModal actionItem={actionItem} onClose={() => setShowReopenModal(false)} />}
    </div>
  );
}
