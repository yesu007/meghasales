'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { leadStatusColor, leadStatusLabel } from '@/lib/leadStatus';

export interface LeadOption {
  id: number;
  companyName: string;
  contactPerson: string;
  status: string;
}

interface LeadPickerComboboxProps {
  value: LeadOption | null;
  onChange: (lead: LeadOption) => void;
  placeholder?: string;
}

// Server-side search (leads can number in the thousands, unlike the small
// fixed country list CountrySelect filters client-side) — debounced the same
// 300-400ms as every other search box in this app (leads/demos/admin-ticket).
export default function LeadPickerCombobox({ value, onChange, placeholder }: LeadPickerComboboxProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery<LeadOption[]>({
    queryKey: ['lead-picker-search', debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ size: '8', sortBy: 'companyName', sortDir: 'asc' });
      if (debouncedQuery) params.set('search', debouncedQuery);
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to search leads');
      const data = await res.json();
      return data.content.map((l: any) => ({ id: l.id, companyName: l.companyName, contactPerson: l.contactPerson, status: l.status }));
    },
  });

  return (
    <Combobox value={value} onChange={(l: LeadOption) => l && onChange(l)}>
      <div className="relative">
        <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-slate-300 bg-white text-left focus-within:ring-2 focus-within:ring-amber-500">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Combobox.Input
            className="w-full border-none py-2 pl-9 pr-10 text-sm text-slate-800 focus:outline-none"
            displayValue={(l: LeadOption | null) => (l ? l.companyName : '')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder || 'Search by company or contact name...'}
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </Combobox.Button>
        </div>
        <Combobox.Options className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg border border-slate-200 focus:outline-none">
          {isFetching ? (
            <div className="px-3 py-2 text-slate-400">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-slate-500">No leads found</div>
          ) : (
            results.map((l) => (
              <Combobox.Option
                key={l.id}
                value={l}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-3 pr-9 ${active ? 'bg-amber-50 text-amber-900' : 'text-slate-800'}`
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate ${isSelected ? 'font-medium' : ''}`}>{l.companyName}</p>
                        <p className="text-xs text-slate-500 truncate">{l.contactPerson}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${leadStatusColor(l.status)}`}>
                        {leadStatusLabel(l.status)}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="absolute inset-y-0 right-16 flex items-center text-amber-600">
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </div>
    </Combobox>
  );
}
