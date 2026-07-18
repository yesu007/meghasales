'use client';

import { useState, useEffect, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  InboxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';

const ENTITY_TYPES = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'DEMO', label: 'Demo' },
  { value: 'IMPLEMENTATION', label: 'Implementation' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'USER', label: 'User' },
];

const ACTIONS = [
  { value: 'CREATE', label: 'Create', color: 'bg-green-100 text-green-700' },
  { value: 'UPDATE', label: 'Update', color: 'bg-blue-100 text-blue-700' },
  { value: 'DELETE', label: 'Delete', color: 'bg-red-100 text-red-700' },
];

interface AuditLogEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  oldValue: any;
  newValue: any;
  ipAddress: string | null;
  description: string | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchAuditLogs(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/audit-logs?${query}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function AuditLogPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const size = 20;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size) };
  if (search) params.search = search;
  if (entityTypeFilter) params.entityType = entityTypeFilter;
  if (actionFilter) params.action = actionFilter;
  if (userFilter) params.userId = userFilter;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;

  const { data, isLoading, isError: isLogsError } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => fetchAuditLogs(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: users = [], isError: isUsersError } = useQuery<UserOption[]>({
    queryKey: ['users-for-audit'],
    queryFn: fetchUsers,
  });

  useEffect(() => {
    if (isLogsError) toast.error('Failed to load audit logs');
  }, [isLogsError]);

  useEffect(() => {
    if (isUsersError) toast.error('Failed to load users');
  }, [isUsersError]);

  const logs: AuditLogEntry[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const stats = data?.stats || { total: 0, create: 0, update: 0, delete: 0 };
  const activeFilters = [entityTypeFilter, actionFilter, userFilter, dateFrom, dateTo].filter(Boolean).length;

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setEntityTypeFilter(''); setActionFilter(''); setUserFilter('');
    setDateFrom(''); setDateTo(''); setPage(0);
  };

  const exportCsv = () => {
    const exportParams = new URLSearchParams();
    if (search) exportParams.set('search', search);
    if (entityTypeFilter) exportParams.set('entityType', entityTypeFilter);
    if (actionFilter) exportParams.set('action', actionFilter);
    if (userFilter) exportParams.set('userId', userFilter);
    if (dateFrom) exportParams.set('dateFrom', dateFrom);
    if (dateTo) exportParams.set('dateTo', dateTo);
    window.open(`/api/audit-logs/export?${exportParams.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Report</h1>
          <p className="text-slate-500 mt-1">Track every create, update, and delete across the system</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <ArrowDownTrayIcon className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Events</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
        </div>
        <button onClick={() => { setActionFilter(actionFilter === 'CREATE' ? '' : 'CREATE'); setPage(0); }} className={`bg-white rounded-xl border p-4 text-left transition-all ${actionFilter === 'CREATE' ? 'border-green-400 ring-2 ring-green-200' : 'border-slate-200 hover:border-green-300'}`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Created</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.create}</p>
        </button>
        <button onClick={() => { setActionFilter(actionFilter === 'UPDATE' ? '' : 'UPDATE'); setPage(0); }} className={`bg-white rounded-xl border p-4 text-left transition-all ${actionFilter === 'UPDATE' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Updated</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.update}</p>
        </button>
        <button onClick={() => { setActionFilter(actionFilter === 'DELETE' ? '' : 'DELETE'); setPage(0); }} className={`bg-white rounded-xl border p-4 text-left transition-all ${actionFilter === 'DELETE' ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200 hover:border-red-300'}`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Deleted</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.delete}</p>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search description or entity type..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <select value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Entities</option>
            {ENTITY_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Actions</option>
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">From</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">To</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
          </div>
          {(searchInput || activeFilters > 0) && (
            <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-500">Clear All</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardDocumentListIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No audit events found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Entity</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Description</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dayjs(log.createdAt).format('DD MMM YYYY, h:mm:ss A')}</td>
                        <td className="px-4 py-3 text-slate-700">{log.userName || 'System'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTIONS.find(a => a.value === log.action)?.color || 'bg-slate-100 text-slate-700'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-md truncate">{log.description || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {(log.oldValue || log.newValue) && (
                            <button onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
                              {expandedId === log.id ? 'Hide' : 'View'}
                              {expandedId === log.id ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === log.id && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Before</p>
                                <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-slate-700">
                                  {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '(none)'}
                                </pre>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">After</p>
                                <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-slate-700">
                                  {log.newValue ? JSON.stringify(log.newValue, null, 2) : '(none)'}
                                </pre>
                              </div>
                            </div>
                            {log.ipAddress && <p className="text-xs text-slate-400 mt-2">IP: {log.ipAddress}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
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
