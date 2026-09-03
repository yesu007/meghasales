'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TEKFILO_LOGO } from '@/lib/logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Response is deliberately the same generic message whether or not the
    // email matched a real account (see POST /api/auth/password-reset-request)
    // — no need to even inspect the response body here, just show it.
    await fetch('/api/auth/password-reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TEKFILO_LOGO} alt="Tekfilo" className="h-9 w-auto mx-auto" />
          <p className="text-slate-500 mt-3">MeghaSales CRM</p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-600">
              If an account exists for that email, an administrator has been notified and will reach out with a new password.
            </p>
            <Link href="/login" className="inline-block text-sm font-medium text-amber-700 hover:text-amber-800">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-slate-500">
              Enter your account email — an administrator will be notified and will reset your password for you.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@tekfilo.com"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : 'Notify Administrator'}
            </button>
            <p className="text-center text-xs">
              <Link href="/login" className="text-slate-500 hover:text-slate-700">Back to Sign In</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
