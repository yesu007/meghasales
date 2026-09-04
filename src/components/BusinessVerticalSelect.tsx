'use client';

import { Fragment, useState } from 'react';
import { Popover, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface VerticalOption { id: number; name: string }
async function fetchVerticalOptions(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}

export interface BusinessVerticalSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

// Multi-select Business Vertical picker — looks and behaves like a plain
// single-select field (Lead Source, etc.) when closed, with selected
// verticals shown as removable chips, and opens into a searchable checkbox
// list below. Originally built for the Lead form
// (src/components/leads/LeadFormDrawer.tsx); extracted here so the Add
// Customer form (src/components/customers/CustomerFormDrawer.tsx) reuses
// the exact same component/UI/behavior instead of a second copy — same
// convention as CustomerFormDrawer's own module comment about mirroring
// the Lead form.
export default function BusinessVerticalSelect({ value, onChange, error }: BusinessVerticalSelectProps) {
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions });
  const [search, setSearch] = useState('');
  const filteredVerticalOptions = verticalOptions.filter((v) => v.name.toLowerCase().includes(search.trim().toLowerCase()));

  const toggle = (name: string, checked: boolean) => {
    onChange(checked ? [...value, name] : value.filter((v) => v !== name));
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  const VISIBLE_CHIPS = 3;
  const overflowCount = value.length - VISIBLE_CHIPS;

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <Popover.Button
            type="button"
            className={`w-full min-h-[38px] px-3 py-1.5 border rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 flex items-center justify-between gap-2 ${error ? 'border-red-400' : 'border-slate-300'}`}
          >
            <span className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
              {value.length === 0 ? (
                <span className="text-slate-400">Select</span>
              ) : (
                <>
                  {value.slice(0, VISIBLE_CHIPS).map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                      {name}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); remove(name); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); remove(name); } }}
                        className="hover:text-amber-900 cursor-pointer"
                        aria-label={`Remove ${name}`}
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </span>
                    </span>
                  ))}
                  {overflowCount > 0 && <span className="text-xs text-slate-500">+{overflowCount} more</span>}
                </>
              )}
            </span>
            <ChevronDownIcon className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Popover.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="opacity-0 -translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-75"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 -translate-y-1"
          >
            <Popover.Panel className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg">
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vertical..."
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {filteredVerticalOptions.map(v => {
                  const checked = value.includes(v.name);
                  return (
                    <label key={v.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${checked ? 'bg-amber-50 text-amber-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggle(v.name, e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      {v.name}
                    </label>
                  );
                })}
                {filteredVerticalOptions.length === 0 && (
                  <p className="px-2 py-2 text-sm text-slate-400">{verticalOptions.length === 0 ? 'No verticals available' : 'No verticals found'}</p>
                )}
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
}
