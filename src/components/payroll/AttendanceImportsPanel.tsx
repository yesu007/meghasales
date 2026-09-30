'use client';

// Access Control import status — every attendance log the backend has
// pulled from SFTP (hourly cron / "Sync now") or received by upload, with
// its counts. Manual upload takes one file at a time — the Login/Logout
// Excel workbook or the device's .dat log, each from its own picker. The
// browser only sends it to POST /api/payroll/attendance/imports; parsing,
// validation and attendance calculation all happen on the server.

import { Fragment, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronRightIcon, CloudArrowDownIcon, DocumentTextIcon, TableCellsIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '@/hooks/usePermissions';

interface ImportRow {
  id: number;
  fileName: string;
  source: string;
  uploadedAt: string;
  processingCompletedAt: string | null;
  totalRecords: number;
  successfulRecords: number;
  duplicateRecords: number;
  invalidRecords: number;
  unmatchedRecords: number;
  unmatchedEmployees: number;
  status: string;
  errorMessage: string | null;
  hasRawFile: boolean;
  punchesAdded: number;
  hasExcel: boolean;
  excelStored: boolean;
  dateRange: { from: string; to: string } | null;
  unmatchedIds: { accessControlId: string; name: string | null; rows: number; mappedTo: string | null }[];
  invalidRows: { line: number; reason: string }[];
}
interface ImportsResponse { sftpConfigured: boolean; imports: ImportRow[] }

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-slate-100 text-slate-600',
};

async function fetchImports(): Promise<ImportsResponse> {
  const res = await fetch('/api/payroll/attendance/imports');
  if (!res.ok) throw new Error('Failed to fetch attendance imports');
  return res.json();
}

async function jsonOrThrow(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || fallback);
  return body;
}

export default function AttendanceImportsPanel() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canImport = has('create_timesheet');
  const canReprocess = has('edit_timesheet');
  const canDelete = has('delete_timesheet');
  const [expanded, setExpanded] = useState<number | null>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const datInput = useRef<HTMLInputElement>(null);
  // Only one upload at a time: picking a file in one field clears the other.
  const [picked, setPicked] = useState<{ kind: 'excel' | 'dat'; file: File } | null>(null);
  const pick = (kind: 'excel' | 'dat', file: File | null | undefined) => {
    const other = kind === 'excel' ? datInput : excelInput;
    if (other.current) other.current.value = '';
    setPicked(file ? { kind, file } : null);
  };
  const clearPicked = () => {
    if (excelInput.current) excelInput.current.value = '';
    if (datInput.current) datInput.current.value = '';
    setPicked(null);
  };

  const { data, isLoading } = useQuery({ queryKey: ['attendance-imports'], queryFn: fetchImports });
  const imports = data?.imports || [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-imports'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  const sync = useMutation({
    mutationFn: async () => jsonOrThrow(await fetch('/api/payroll/attendance/imports/sync', { method: 'POST' }), 'SFTP sync failed'),
    onSuccess: (r: { files: { result: string }[] }) => {
      refresh();
      const imported = r.files.filter((f) => f.result === 'IMPORTED').length;
      const failed = r.files.filter((f) => f.result === 'FAILED').length;
      if (failed) toast.error(`${failed} file(s) failed to import`);
      else toast.success(imported ? `${imported} new file(s) imported` : 'No new attendance files on SFTP');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('file', picked!.file);
      form.append('kind', picked!.kind);
      return jsonOrThrow(await fetch('/api/payroll/attendance/imports', { method: 'POST', body: form }), 'Upload failed');
    },
    onSuccess: (r: { skipped: boolean; import: { status: string; errorMessage: string | null } }) => {
      refresh();
      clearPicked();
      if (r.skipped) toast('This exact file was already imported — nothing changed', { icon: 'ℹ️' });
      else if (r.import.status === 'FAILED') toast.error(r.import.errorMessage || 'Import failed');
      else toast.success(`Attendance imported (${r.import.status === 'PARTIAL' ? 'with warnings' : 'all rows'})`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => jsonOrThrow(await fetch(`/api/payroll/attendance/imports/${id}`, { method: 'DELETE' }), 'Delete failed'),
    onSuccess: (r: { fileName: string; punchesRemoved: number }) => { refresh(); toast.success(`${r.fileName} deleted${r.punchesRemoved ? ` — ${r.punchesRemoved} punch(es) removed` : ''}`); },
    onError: (err: Error) => toast.error(err.message),
  });
  const confirmDelete = (imp: ImportRow) => {
    const detail = imp.punchesAdded > 0
      ? `This also removes the ${imp.punchesAdded} attendance punch(es) this file added, and the affected days' attendance is recalculated.`
      : 'This file added no attendance punches, so attendance is not affected.';
    if (window.confirm(`Delete import "${imp.fileName}" (${dayjs(imp.uploadedAt).format('DD MMM YYYY, HH:mm')})?\n\n${detail} This cannot be undone.`)) remove.mutate(imp.id);
  };

  const reprocess = useMutation({
    mutationFn: async (id: number) => jsonOrThrow(await fetch(`/api/payroll/attendance/imports/${id}/reprocess`, { method: 'POST' }), 'Re-process failed'),
    onSuccess: () => { refresh(); toast.success('Import re-processed'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Attendance Imports</h2>
        </div>
        {canImport && (
          <div className="flex flex-wrap items-end gap-2">
            {data?.sftpConfigured && (
              <button onClick={() => sync.mutate()} disabled={sync.isPending} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <CloudArrowDownIcon className="h-4 w-4" /> {sync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            <input ref={excelInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick('excel', e.target.files?.[0])} />
            <input ref={datInput} type="file" accept=".dat,.dot" className="hidden" onChange={(e) => pick('dat', e.target.files?.[0])} />
            {(['excel', 'dat'] as const).map((kind) => {
              const active = picked?.kind === kind;
              // One upload at a time: while a file is chosen in the other
              // field this one is locked — clear that file (×) to switch.
              const locked = !!picked && !active;
              return (
                <div key={kind} className="flex flex-col gap-1">
                  <button
                    onClick={() => (kind === 'excel' ? excelInput : datInput).current?.click()}
                    disabled={locked || upload.isPending}
                    title={locked ? `Clear the ${picked!.kind === 'excel' ? 'Excel' : '.dat'} file first — only one file can be uploaded at a time` : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm max-w-[240px] disabled:cursor-not-allowed ${active ? 'border-amber-500 bg-amber-50 text-amber-800' : locked ? 'border-slate-200 bg-slate-50 text-slate-300' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {kind === 'excel' ? <TableCellsIcon className="h-4 w-4 flex-shrink-0" /> : <DocumentTextIcon className="h-4 w-4 flex-shrink-0" />}
                    <span className="truncate">{active ? picked!.file.name : kind === 'excel' ? 'Choose Excel file…' : 'Choose .dat file…'}</span>
                    {active && (
                      <XMarkIcon className="h-4 w-4 flex-shrink-0 text-amber-600 hover:text-amber-800" onClick={(e) => { e.stopPropagation(); clearPicked(); }} />
                    )}
                  </button>
                </div>
              );
            })}
            <button onClick={() => upload.mutate()} disabled={!picked || upload.isPending} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              <ArrowUpTrayIcon className="h-4 w-4" /> {upload.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : imports.length === 0 ? (
        <p className="text-center py-12 text-slate-400">No attendance files imported yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">File Name</th>
                <th className="px-4 py-2.5 text-left font-semibold">Import Date</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5 text-right font-semibold">Imported</th>
                <th className="px-4 py-2.5 text-right font-semibold">Duplicate</th>
                <th className="px-4 py-2.5 text-right font-semibold">Invalid</th>
                <th className="px-4 py-2.5 text-right font-semibold">Unmatched Employees</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Message</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((imp) => {
                const hasDetails = imp.unmatchedIds.length > 0 || imp.invalidRows.length > 0;
                const stillUnmatched = imp.unmatchedIds.filter((u) => !u.mappedTo).length;
                const open = expanded === imp.id;
                return (
                  <Fragment key={imp.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button onClick={() => hasDetails && setExpanded(open ? null : imp.id)} className={`flex items-center gap-1 text-left ${hasDetails ? 'text-slate-800 hover:text-amber-700' : 'text-slate-800 cursor-default'}`}>
                          {hasDetails ? (open ? <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0" />) : <span className="w-3.5" />}
                          <span className="font-medium">{imp.fileName}</span>
                        </button>
                        <p className="text-xs text-slate-400 ml-[18px]">
                          {imp.source === 'SFTP' ? 'SFTP (.dat)' : /\.xlsx$/i.test(imp.fileName) ? 'Excel upload' : 'Device log upload'}
                          {imp.hasRawFile ? ' · saved to S3' : ' · not in S3'}
                          {imp.dateRange ? ` · ${dayjs(imp.dateRange.from).format('DD MMM')} – ${dayjs(imp.dateRange.to).format('DD MMM YYYY')}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dayjs(imp.uploadedAt).format('DD MMM YYYY, HH:mm')}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{imp.totalRecords}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">{imp.successfulRecords}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{imp.duplicateRecords}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${imp.invalidRecords ? 'text-red-600 font-medium' : 'text-slate-500'}`}>{imp.invalidRecords}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${imp.unmatchedEmployees ? 'text-amber-700 font-medium' : 'text-slate-500'}`} title={`${imp.unmatchedRecords} row(s) at import time`}>
                        {imp.unmatchedEmployees}
                        {imp.unmatchedEmployees > 0 && stillUnmatched < imp.unmatchedIds.length && (
                          <p className="text-[11px] font-normal text-green-700">{stillUnmatched === 0 ? 'all mapped now' : `${stillUnmatched} still open`}</p>
                        )}
                      </td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[imp.status] || 'bg-slate-100 text-slate-600'}`}>{imp.status}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[260px]">{imp.errorMessage || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {imp.hasExcel && (
                            <a href={`/api/payroll/attendance/imports/${imp.id}/excel`} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50" title="Download Login/Logout Excel"><ArrowDownTrayIcon className="h-4 w-4" /></a>
                          )}
                          {canReprocess && imp.hasRawFile && (
                            <button onClick={() => reprocess.mutate(imp.id)} disabled={reprocess.isPending} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50" title="Re-process this file"><ArrowPathIcon className="h-4 w-4" /></button>
                          )}
                          {canDelete && imp.status !== 'PROCESSING' && (
                            <button onClick={() => confirmDelete(imp)} disabled={remove.isPending} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete this import"><TrashIcon className="h-4 w-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={10} className="px-6 py-4 space-y-3">
                          {imp.unmatchedIds.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 mb-1.5">Login User IDs not mapped to any employee when this file was imported — set the Login User ID on the employee&apos;s profile and their attendance fills in automatically</p>
                              <div className="flex flex-wrap gap-1.5">
                                {imp.unmatchedIds.map((u) => (
                                  u.mappedTo ? (
                                    <span key={u.accessControlId} className="px-2 py-1 rounded bg-green-50 border border-green-100 text-xs text-green-800" title="Mapped since this import — attendance already filled in">
                                      ID {u.accessControlId}{u.name ? ` · ${u.name}` : ''} → {u.mappedTo}
                                    </span>
                                  ) : (
                                    <span key={u.accessControlId} className="px-2 py-1 rounded bg-amber-50 border border-amber-100 text-xs text-amber-800">
                                      ID {u.accessControlId}{u.name ? ` · ${u.name}` : ''} <span className="text-amber-500">({u.rows})</span>
                                    </span>
                                  )
                                ))}
                              </div>
                            </div>
                          )}
                          {imp.invalidRows.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 mb-1.5">Invalid rows{imp.invalidRecords > imp.invalidRows.length ? ` (first ${imp.invalidRows.length} of ${imp.invalidRecords})` : ''}</p>
                              <ul className="text-xs text-red-700 space-y-0.5">
                                {imp.invalidRows.map((r) => <li key={r.line}>Line {r.line}: {r.reason}</li>)}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
