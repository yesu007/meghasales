'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import EventCard from './EventCard';
import EventDrawer from './EventDrawer';

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

interface EventsTabProps {
  leadId: number;
  canManage: boolean;
  canAddDiscussion: boolean;
}

async function fetchEvents(leadId: number): Promise<EventRecord[]> {
  const res = await fetch(`/api/leads/${leadId}/events`);
  if (!res.ok) throw new Error('Failed to load events');
  return res.json();
}

export default function EventsTab({ leadId, canManage, canAddDiscussion }: EventsTabProps) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', leadId],
    queryFn: () => fetchEvents(leadId),
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success('Event deleted');
    },
    onError: () => toast.error('Failed to delete event'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Events</h2>
        {canManage && (
          <button onClick={() => { setEditingEvent(null); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> New Event
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <CalendarDaysIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-slate-600 font-medium">No events yet</p>
          <p className="text-sm text-slate-400 mt-1">{canManage ? 'Create one to get started' : 'Events will appear here once scheduled'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              leadId={leadId}
              event={event}
              canManage={canManage}
              canAddDiscussion={canAddDiscussion}
              onEdit={() => { setEditingEvent(event); setDrawerOpen(true); }}
              onDelete={() => { if (window.confirm(`Delete event "${event.title}"?`)) deleteMutation.mutate(event.id); }}
            />
          ))}
        </div>
      )}

      <EventDrawer
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingEvent(null); }}
        leadId={leadId}
        event={editingEvent}
      />
    </div>
  );
}
