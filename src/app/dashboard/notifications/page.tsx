'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellIcon,
  CheckIcon,
  InboxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const NOTIFICATION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'DEMO', label: 'Demo' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'IMPLEMENTATION', label: 'Implementation' },
  { value: 'SYSTEM', label: 'System' },
];

const TYPE_COLORS: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700',
  DEMO: 'bg-purple-100 text-purple-700',
  QUOTATION: 'bg-amber-100 text-amber-700',
  IMPLEMENTATION: 'bg-green-100 text-green-700',
  SYSTEM: 'bg-slate-100 text-slate-700',
};

interface Notification {
  id: number;
  userId: number;
  userName: string;
  title: string;
  message: string | null;
  type: string;
  channel: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

async function fetchNotifications(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/notifications?${query}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [page, setPage] = useState(0);
  const size = 20;

  const params: Record<string, string> = { page: String(page), size: String(size) };
  if (typeFilter) params.type = typeFilter;
  if (readFilter) params.isRead = readFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', params],
    queryFn: () => fetchNotifications(params),
    placeholderData: (prev: any) => prev,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });

  const notifications: Notification[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
          <p className="text-slate-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            <CheckIcon className="h-4 w-4" /> Mark All Read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            {NOTIFICATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={readFilter}
            onChange={(e) => { setReadFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
          {(typeFilter || readFilter) && (
            <button onClick={() => { setTypeFilter(''); setReadFilter(''); setPage(0); }} className="text-sm text-slate-500 hover:text-red-500">
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No notifications</p>
            <p className="text-sm text-slate-400 mt-1">You&apos;re all caught up</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 p-4 transition-colors ${
                    notification.isRead ? 'bg-white' : 'bg-amber-50/50'
                  } hover:bg-slate-50`}
                >
                  <div className={`mt-0.5 p-2 rounded-full ${notification.isRead ? 'bg-slate-100' : 'bg-amber-100'}`}>
                    <BellIcon className={`h-4 w-4 ${notification.isRead ? 'text-slate-500' : 'text-amber-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm font-medium ${notification.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
                        {notification.title}
                      </h3>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[notification.type] || 'bg-slate-100 text-slate-700'}`}>
                        {notification.type}
                      </span>
                    </div>
                    {notification.message && (
                      <p className="text-sm text-slate-500 line-clamp-2">{notification.message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-400">{dayjs(notification.createdAt).fromNow()}</span>
                      <span className="text-xs text-slate-400">• {notification.userName}</span>
                    </div>
                  </div>
                  {!notification.isRead && (
                    <button
                      onClick={() => markReadMutation.mutate(notification.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      title="Mark as read"
                    >
                      <EnvelopeOpenIcon className="h-4 w-4" />
                    </button>
                  )}
                  {notification.isRead && (
                    <span className="p-1.5 text-slate-300">
                      <EnvelopeIcon className="h-4 w-4" />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
                </button>
                <span className="text-sm font-medium text-slate-700">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
