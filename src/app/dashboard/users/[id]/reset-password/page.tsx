'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '@/hooks/usePermissions';
import PasswordInput from '@/components/PasswordInput';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/passwordPolicy';

interface ResetRequestInfo {
  id: number;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { firstName: string; lastName: string } | null;
}

interface ResetInfo {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    employeeCode: string | null;
    roles: { id: number; name: string }[];
  };
  pendingRequest: ResetRequestInfo | null;
  latestRequest: ResetRequestInfo | null;
}

const blankForm = { newPassword: '', confirmPassword: '' };
const fmt = (d: string | null) => (d ? dayjs(d).format('DD MMM YYYY, hh:mm A') : '—');

export default function AdminResetPasswordPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  // Both GET and POST /api/users/[id]/reset-password require edit_users.
  const canEdit = has('edit_users');
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const { data, isLoading, error } = useQuery<ResetInfo>({
    queryKey: ['user-reset-password', id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${id}/reset-password`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to load user');
      return body;
    },
    enabled: canEdit,
  });

  const resetMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch(`/api/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to reset password');
      return body;
    },
    onSuccess: () => {
      setForm(blankForm);
      setSucceeded(true);
      toast.success('Password reset successfully');
      queryClient.invalidateQueries({ queryKey: ['user-reset-password', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateNewPassword(form.newPassword, form.confirmPassword);
    setFormError(invalid);
    if (!invalid) resetMutation.mutate(form);
  };

  const header = (
    <div>
      <Link href="/dashboard/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeftIcon className="h-4 w-4" /> Users
      </Link>
      <h1 className="text-2xl font-bold text-slate-800 mt-2">Reset User Password</h1>
      <p className="text-slate-500 mt-1">Set a new password for a user who requested a reset, then share it with them directly</p>
    </div>
  );

  if (!canEdit) {
    return (
      <div className="space-y-6">
        {header}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-sm text-slate-600">
          You don&apos;t have permission to reset user passwords.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
        <p className="mt-4 text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-sm text-red-600">
          {(error as Error)?.message || 'Failed to load user'}
        </div>
      </div>
    );
  }

  const { user, pendingRequest, latestRequest } = data;
  const statusBadge = (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
      {user.isActive ? 'Active' : 'Inactive'}
    </span>
  );
  const details: [string, React.ReactNode][] = [
    ['Name', `${user.firstName} ${user.lastName}`],
    ['Email', user.email],
    ['Phone', user.phone || '—'],
    ['Employee Code', user.employeeCode || '—'],
    ['Roles', user.roles.map((r) => r.name).join(', ') || '—'],
    ['Status', statusBadge],
    ['Last Login', fmt(user.lastLoginAt)],
    ['Reset Requested', pendingRequest ? fmt(pendingRequest.createdAt) : '—'],
  ];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">User Details</h2>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="col-span-2 text-slate-800 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">New Password</h2>

          {succeeded && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
              Password reset and the request marked as resolved. Share the new password with the user.
            </div>
          )}

          {pendingRequest ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!user.isActive && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This user is inactive — they won&apos;t be able to sign in until reactivated from the Users screen.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password *</label>
                <PasswordInput
                  autoComplete="new-password"
                  value={form.newPassword}
                  placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                  onChange={(e) => { setForm((f) => ({ ...f, newPassword: e.target.value })); setFormError(null); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formError ? 'border-red-400' : 'border-slate-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password *</label>
                <PasswordInput
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => { setForm((f) => ({ ...f, confirmPassword: e.target.value })); setFormError(null); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formError ? 'border-red-400' : 'border-slate-300'}`}
                />
                {formError && <p className="text-xs text-red-600 mt-1">{formError}</p>}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={resetMutation.isPending}
                  className="px-6 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {resetMutation.isPending ? 'Saving...' : 'Reset Password'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-600">
              {latestRequest?.status === 'RESOLVED'
                ? `No pending reset request. The last one was resolved ${fmt(latestRequest.resolvedAt)}${latestRequest.resolvedBy ? ` by ${latestRequest.resolvedBy.firstName} ${latestRequest.resolvedBy.lastName}` : ''}.`
                : 'This user has no pending password reset request.'}
              {' '}To change their password anyway, use Edit User on the Users screen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
