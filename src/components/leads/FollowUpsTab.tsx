'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, ClockIcon, PhoneIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { followUpMethodLabel, followUpOutcomeLabel } from '@/lib/leadFollowUp';
import { EVENT_TYPE_LABELS } from './EventDrawer';
import FollowUpDrawer from './FollowUpDrawer';

interface FollowUpRecord {
  id: number;
  source: 'FOLLOWUP' | 'EVENT';
  interactionDate: string;
  method: string;
  title: string | null;
  notes: string | null;
  outcome: string | null;
  nextAction: string | null;
  nextFollowUpDate: string | null;
  loggedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface FollowUpsTabProps {
  leadId: number;
}

async function fetchFollowUps(leadId: number): Promise<FollowUpRecord[]> {
  const res = await fetch(`/api/leads/${leadId}/follow-ups`);
  if (!res.ok) throw new Error('Failed to load follow-ups');
  return res.json();
}

export default function FollowUpsTab({ leadId }: FollowUpsTabProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: followUps = [], isLoading } = useQuery({
    queryKey: ['follow-ups', leadId],
    queryFn: () => fetchFollowUps(leadId),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Follow-up History</h2>
        <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> Add Follow-up
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : followUps.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <ClockIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-slate-600 font-medium">No follow-ups logged yet</p>
          <p className="text-sm text-slate-400 mt-1">Add one to start tracking contact with this lead</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <ul className="space-y-5">
            {followUps.map((f, idx) => (
              <li key={`${f.source}-${f.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${f.source === 'EVENT' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {f.source === 'EVENT' ? <CalendarDaysIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" />}
                  </span>
                  {idx < followUps.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                </div>
                <div className="pb-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">
                      {f.source === 'EVENT' ? (EVENT_TYPE_LABELS[f.method] || f.method) : followUpMethodLabel(f.method)}
                    </span>
                    <span className="text-xs text-slate-400">{dayjs(f.interactionDate).format('DD MMM YYYY')}</span>
                    {f.source === 'EVENT' && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600">From Event</span>}
                    {f.outcome && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{followUpOutcomeLabel(f.outcome)}</span>}
                  </div>
                  {f.title && <p className="text-sm font-medium text-slate-700 mt-1">{f.title}</p>}
                  {f.notes && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{f.notes}</p>}
                  {f.nextAction && <p className="text-sm text-slate-500 mt-1"><span className="font-medium">Next action:</span> {f.nextAction}</p>}
                  {f.nextFollowUpDate && <p className="text-sm text-slate-500 mt-1"><span className="font-medium">Next follow-up:</span> {dayjs(f.nextFollowUpDate).format('DD MMM YYYY')}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {f.loggedBy ? `${f.source === 'EVENT' ? 'Created' : 'Logged'} by ${f.loggedBy.firstName} ${f.loggedBy.lastName} · ` : ''}{dayjs(f.createdAt).format('DD MMM YYYY, HH:mm')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FollowUpDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} leadId={leadId} />
    </div>
  );
}
