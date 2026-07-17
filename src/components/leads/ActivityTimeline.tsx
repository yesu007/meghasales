'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircleIcon, CalendarDaysIcon, DocumentIcon, ChatBubbleLeftRightIcon,
  TrashIcon, PlayCircleIcon, XCircleIcon, ClockIcon, PlusCircleIcon,
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';

interface Activity {
  id: number;
  activityType: string;
  description: string | null;
  createdAt: string;
  performedBy: { firstName: string; lastName: string } | null;
}

interface ActivityTimelineProps {
  leadId: number;
}

const ACTIVITY_ICONS: Record<string, typeof ClockIcon> = {
  CREATED: PlusCircleIcon,
  LEAD_CONFIRMED: CheckCircleIcon,
  DEMO_SCHEDULED: CalendarDaysIcon,
  DEMO_STATUS_CHANGED: PlayCircleIcon,
  EVENT_CREATED: CalendarDaysIcon,
  EVENT_COMPLETED: CheckCircleIcon,
  EVENT_CANCELLED: XCircleIcon,
  EVENT_DELETED: TrashIcon,
  DOCUMENT_UPLOADED: DocumentIcon,
  DOCUMENT_REPLACED: DocumentIcon,
  DOCUMENT_DELETED: TrashIcon,
  DISCUSSION_ADDED: ChatBubbleLeftRightIcon,
};

async function fetchActivities(leadId: number): Promise<Activity[]> {
  const res = await fetch(`/api/leads/${leadId}/activities`);
  if (!res.ok) throw new Error('Failed to load activity timeline');
  return res.json();
}

export default function ActivityTimeline({ leadId }: ActivityTimelineProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: () => fetchActivities(leadId),
  });

  if (isLoading) {
    return <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <ClockIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-slate-600 font-medium">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <ul className="space-y-5">
        {activities.map((a, idx) => {
          const Icon = ACTIVITY_ICONS[a.activityType] || ClockIcon;
          return (
            <li key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600 flex-shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
                {idx < activities.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-1">
                <p className="text-sm text-slate-800">{a.description || a.activityType.replace(/_/g, ' ').toLowerCase()}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {a.performedBy ? `${a.performedBy.firstName} ${a.performedBy.lastName} · ` : ''}{dayjs(a.createdAt).format('DD MMM YYYY, HH:mm')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
