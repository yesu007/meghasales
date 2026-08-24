'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardDocumentCheckIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { ACTION_ITEM_STATUSES, ACTION_ITEM_PRIORITIES } from '@/lib/meetings/constants';

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

async function fetchActionItems(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/action-items?${query}`);
  if (!res.ok) throw new Error('Failed to fetch action items');
  return res.json();
}

export default function ActionItemsListPage() {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size) };
  if (statusFilter) params.status = statusFilter;
  if (search) params.search = search;
  if (priorityFilter) params.priority = priorityFilter;
  if (dueDateFrom) params.dueDateFrom = dueDateFrom;
  if (dueDateTo) params.dueDateTo = dueDateTo;

  const { data, isLoading } = useQuery({
    queryKey: ['action-items-list', params],
    queryFn: () => fetchActionItems(params),
    placeholderData: (prev: any) => prev,
  });

  const actionItems = data?.content || [];
  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const allCount = Object.values(statusCounts).reduce((s, n) => s + (n || 0), 0);
  const totalPages = data?.totalPages || 0;
  const totalElements = data?.totalElements || 0;

  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
    if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
    return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
  };
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Action Items</h1>
          <p className="text-slate-500 mt-1">Track action items assigned across all meetings</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[{ v: '', l: 'All' }, ...ACTION_ITEM_STATUSES.map((s) => ({ v: s, l: s.replace('_', ' ') }))].map((s) => (
            <button
              key={s.v}
              onClick={() => { setStatusFilter(s.v); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s.v ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {s.l} <span className="opacity-70">({s.v ? statusCounts[s.v] ?? 0 : allCount})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="relative">
            <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search action items"
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-56"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">All priorities</option>
              {ACTION_ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Due From</label>
            <input
              type="date"
              value={dueDateFrom}
              onChange={(e) => { setDueDateFrom(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Due To</label>
            <input
              type="date"
              value={dueDateTo}
              onChange={(e) => { setDueDateTo(e.target.value); setPage(0); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          {(priorityFilter || dueDateFrom || dueDateTo || search) && (
            <button
              onClick={() => { setPriorityFilter(''); setDueDateFrom(''); setDueDateTo(''); setSearchInput(''); setSearch(''); setPage(0); }}
              className="text-sm text-slate-500 hover:text-red-500"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : actionItems.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16">
          <ClipboardDocumentCheckIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-lg font-medium text-slate-600">No action items</p>
          <p className="text-sm text-slate-400 mt-1">Action items are created from a meeting&apos;s detail page</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Description</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Meeting</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Assigned To</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                {actionItems.map((a: any, idx: number) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/dashboard/action-items/${a.id}`)}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors cursor-pointer`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/action-items/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-amber-600">
                        {a.description}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {a.meeting ? (
                        <Link href={`/dashboard/meetings/${a.meetingId}`} onClick={(e) => e.stopPropagation()} className="hover:text-amber-600">
                          {a.meeting.title}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{a.assignedToName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(a.dueDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_COLORS[a.priority] || 'bg-slate-100 text-slate-700'}`}>{a.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-700'}`}>{a.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
        </div>
      )}
    </div>
  );
}
