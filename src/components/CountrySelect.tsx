'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline';

export interface Country {
  id: number;
  countryName: string;
  isoCode: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  defaultTaxType: string;
  defaultTaxPercentage: number | string;
  flagEmoji: string | null;
  isActive: boolean;
}

interface CountrySelectProps {
  value: number | null;
  onChange: (country: Country) => void;
  disabled?: boolean;
}

export default function CountrySelect({ value, onChange, disabled }: CountrySelectProps) {
  const [query, setQuery] = useState('');

  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ['countries'],
    queryFn: async () => {
      const res = await fetch('/api/countries?activeOnly=true');
      if (!res.ok) throw new Error('Failed to load countries');
      return res.json();
    },
  });

  const selected = countries.find((c) => c.id === value) || null;

  const filtered = query === ''
    ? countries
    : countries.filter((c) =>
        c.countryName.toLowerCase().includes(query.toLowerCase()) ||
        c.isoCode.toLowerCase().includes(query.toLowerCase())
      );

  return (
    <Combobox value={selected} onChange={(c: Country) => c && onChange(c)} disabled={disabled}>
      <div className="relative">
        <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-slate-300 bg-white text-left focus-within:ring-2 focus-within:ring-amber-500 disabled:bg-slate-100">
          <Combobox.Input
            className="w-full border-none py-2 pl-3 pr-10 text-sm text-slate-800 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
            displayValue={(c: Country | null) => (c ? `${c.flagEmoji ? c.flagEmoji + ' ' : ''}${c.countryName}` : '')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country..."
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </Combobox.Button>
        </div>
        <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg border border-slate-200 focus:outline-none">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-slate-500">No country found</div>
          ) : (
            filtered.map((c) => (
              <Combobox.Option
                key={c.id}
                value={c}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-3 pr-9 ${active ? 'bg-amber-50 text-amber-900' : 'text-slate-800'}`
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <span className={`block truncate ${isSelected ? 'font-medium' : ''}`}>
                      {c.flagEmoji ? `${c.flagEmoji} ` : ''}{c.countryName}
                    </span>
                    {isSelected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-amber-600">
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
