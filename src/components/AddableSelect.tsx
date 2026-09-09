'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Dropdown with an extra "+ Add …" action styled like this app's other
// primary buttons — a plain <option> can't carry that styling, so any
// select needing an inline "create new" affordance uses this instead of a
// native <select>. Extracted from src/app/dashboard/expenses/page.tsx's
// own original (the Category/Sub Category mapping form's own picker,
// still using this same component) so it's shared rather than duplicated.
// A built-in search box (client-side, same substring-match convention as
// every other search box in this app) filters the options list once it
// gets long enough to matter — e.g. the Project/Product Master's own
// Customer field. The pinned "+ Add …" action is optional (omit both
// onAdd/addLabel) for a picker that wants this same search+select UI
// without a create-new affordance — e.g. those same forms' own Lead
// field, which mirrors Customer's dropdown look/behavior but deliberately
// has no "+ Add Lead" button.
export default function AddableSelect({
  value, onChange, options, placeholder, onAdd, addLabel, disabled, error,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  onAdd?: () => void;
  addLabel?: string;
  disabled?: boolean;
  // Same red-border-on-invalid convention as every plain <select>/<input>
  // elsewhere in this app — pass formErrors.<field> straight through.
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, query]);

  // Search is reset every time the dropdown closes (however it closes —
  // picking an option, "+ Add …", or clicking away) so reopening it always
  // starts from the full list rather than a stale filtered one.
  const close = () => { setOpen(false); setQuery(''); };

  const toggle = () => { if (!disabled) (open ? close() : setOpen(true)); };

  return (
    <div className="relative">
      {/* A plain <button> can't host the "×" clear button below as a real,
          independently-clickable child — nested interactive controls are
          invalid HTML (a <button> inside a <button>) and unreliable across
          browsers/assistive tech. This is a div standing in for the trigger
          button instead, with the same role/keyboard/focus behavior. */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
          else if (e.key === 'Escape') close();
        }}
        className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 flex items-center justify-between gap-1 text-left ${error ? 'border-red-400' : 'border-slate-300'} ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
      >
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <span className="flex items-center gap-0.5 shrink-0">
          {/* Only ever shown once a value is actually selected, and never
              while disabled — clearing a locked/read-only field makes no
              sense. Its own click must not also open/close the dropdown
              (stopPropagation) or submit an enclosing <form> (type="button").
              Checked against `value` rather than `selected`: some callers
              (list-page filter bars, and a few "neutral default" fields like
              Quotation's Vertical/Bill To) deliberately give '' its own real,
              labeled option — e.g. "All Sources" — instead of treating it as
              a placeholder. That option still counts as "nothing selected"
              for clear-button purposes; showing an × on a fresh, untouched
              filter would contradict "don't show it when empty". */}
          {value !== '' && !disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
              aria-label="Clear selection"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDownIcon className="h-4 w-4 text-slate-400" />
        </span>
      </div>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col max-h-72">
            <div className="p-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  // autoFocus moves focus here as soon as the dropdown
                  // opens, so Escape has to be caught on this input too —
                  // the trigger's own onKeyDown (below) never sees it,
                  // since this search box is a sibling of the trigger, not
                  // a descendant, and keydown doesn't bubble sideways.
                  onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
                  placeholder="Search..."
                  className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-md text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>
            {/* Only this options list scrolls — the "+ Add …" button below
                stays fixed at the bottom of the dropdown, never scrolling
                out of view. */}
            <div className="overflow-y-auto flex-1">
              {filteredOptions.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">{query ? 'No matches found' : 'No options yet'}</p>
              )}
              {filteredOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); close(); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 ${o.value === value ? 'bg-amber-50 text-amber-700 font-medium' : 'text-slate-700'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {onAdd && (
              <div className="border-t border-slate-200 p-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => { close(); onAdd(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                >
                  <PlusIcon className="h-4 w-4" /> {addLabel}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
