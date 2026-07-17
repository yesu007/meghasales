'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon, CalendarDaysIcon, MapPinIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { EVENT_TYPE_LABELS } from './EventDrawer';
import DocumentList from './DocumentList';
import DiscussionTimeline from './DiscussionTimeline';

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

interface EventRecord {
  id: number;
  title: string;
  eventType: string;
  eventDateTime: string;
  duration: number | null;
  participants: string | null;
  location: string | null;
  meetingLink: string | null;
  description: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  status: string;
  createdBy: { firstName: string; lastName: string } | null;
  createdAt: string;
  _count?: { documents: number; discussions: number };
}

interface EventCardProps {
  leadId: number;
  event: EventRecord;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
  canAddDiscussion: boolean;
}

export default function EventCard({ leadId, event, onEdit, onDelete, canManage, canAddDiscussion }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-slate-50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800">{event.title}</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[event.status] || 'bg-slate-100 text-slate-700'}`}>{event.status}</span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><CalendarDaysIcon className="h-3.5 w-3.5" /> {dayjs(event.eventDateTime).format('DD MMM YYYY, HH:mm')}{event.duration ? ` · ${event.duration} min` : ''}</span>
            {event.location && <span className="flex items-center gap-1"><MapPinIcon className="h-3.5 w-3.5" /> {event.location}</span>}
            {event.participants && <span className="flex items-center gap-1"><UserGroupIcon className="h-3.5 w-3.5" /> {event.participants}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canManage && (
            <>
              <span onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer" title="Edit">
                <PencilIcon className="h-4 w-4" />
              </span>
              <span onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
                <TrashIcon className="h-4 w-4" />
              </span>
            </>
          )}
          {expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
          {(event.description || event.nextAction || event.followUpDate || event.meetingLink) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {event.description && <div><p className="text-xs font-medium text-slate-500 uppercase">Description</p><p className="text-slate-700 mt-1 whitespace-pre-wrap">{event.description}</p></div>}
              {event.nextAction && <div><p className="text-xs font-medium text-slate-500 uppercase">Next Action</p><p className="text-slate-700 mt-1 whitespace-pre-wrap">{event.nextAction}</p></div>}
              {event.followUpDate && <div><p className="text-xs font-medium text-slate-500 uppercase">Follow-up Date</p><p className="text-slate-700 mt-1">{dayjs(event.followUpDate).format('DD MMM YYYY')}</p></div>}
              {event.meetingLink && <div><p className="text-xs font-medium text-slate-500 uppercase">Meeting Link</p><a href={event.meetingLink} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline mt-1 inline-block break-all">{event.meetingLink}</a></div>}
            </div>
          )}
          <DocumentList leadId={leadId} eventId={event.id} canManage={canManage} />
          <DiscussionTimeline leadId={leadId} eventId={event.id} canAdd={canAddDiscussion} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
