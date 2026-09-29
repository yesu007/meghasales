'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import PasswordInput from '@/components/PasswordInput';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/passwordPolicy';

const blankForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
type FormKey = keyof typeof blankForm;

const FIELDS: { key: FormKey; label: string; autoComplete: string; placeholder?: string }[] = [
  { key: 'currentPassword', label: 'Current Password', autoComplete: 'current-password' },
  { key: 'newPassword', label: 'New Password', autoComplete: 'new-password', placeholder: `Min ${MIN_PASSWORD_LENGTH} characters` },
  { key: 'confirmPassword', label: 'Confirm New Password', autoComplete: 'new-password' },
];

export default function ChangePasswordPage() {
  const [form, setForm] = useState(blankForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [succeeded, setSucceeded] = useState(false);

  const validate = (data: typeof form) => {
    const errs: Partial<Record<FormKey, string>> = {};
    if (!data.currentPassword) errs.currentPassword = 'Current password is required';
    const invalid = validateNewPassword(data.newPassword, data.confirmPassword);
    if (invalid) errs[/confirm|match/i.test(invalid) ? 'confirmPassword' : 'newPassword'] = invalid;
    return errs;
  };

  const changeMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to change password');
      return body;
    },
    onSuccess: () => {
      setForm(blankForm);
      setSucceeded(true);
      toast.success('Password changed successfully');
    },
    onError: (err: Error) => {
      // Surface a wrong current password on its own field, everything else as a toast.
      if (/current password is incorrect/i.test(err.message)) setFormErrors({ currentPassword: err.message });
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSucceeded(false);
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    changeMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Change Password</h1>
        <p className="text-slate-500 mt-1">Update the password you use to sign in</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-lg space-y-4">
        {succeeded && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
            Your password has been changed. Use the new password the next time you sign in.
          </div>
        )}
        {FIELDS.map(({ key, label, autoComplete, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label} *</label>
            <PasswordInput
              value={form[key]}
              autoComplete={autoComplete}
              placeholder={placeholder}
              onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setFormErrors((fe) => ({ ...fe, [key]: undefined })); }}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors[key] ? 'border-red-400' : 'border-slate-300'}`}
            />
            {formErrors[key] && <p className="text-xs text-red-600 mt-1">{formErrors[key]}</p>}
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={changeMutation.isPending}
            className="px-6 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {changeMutation.isPending ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
