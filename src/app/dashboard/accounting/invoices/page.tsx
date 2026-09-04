'use client';

import { useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, PlusIcon } from '@heroicons/react/24/outline';
import InvoiceListPage, { type InvoiceListPageHandle } from '@/components/accounting/InvoiceListPage';
import { usePermissions } from '@/hooks/usePermissions';

// The "Invoices" module — Pending Invoices and Paid Invoices as two tabs
// over the exact same underlying invoice data/API/component
// (InvoiceListPage's mode='open' vs mode='paid'), rather than the two
// separate sibling pages this module used to be split across
// (dashboard/accounting/pending-invoices, .../paid-invoices — both now
// just redirect here for any existing bookmarks/links). No new
// filtering/status logic — just this page's own header chrome.
//
// Header/tab styling mirrors the Leads page's own title+segmented-pill-
// tabs+subtitle layout (src/app/dashboard/leads/page.tsx). Export/New
// Invoice sit on the same row, right-aligned, per the module's own
// request — InvoiceListPage renders with hideHeading (so it doesn't also
// render its own title/buttons row below) and exposes those two actions
// via a forwarded ref (same underlying state/handlers, just triggered
// from here) so nothing is duplicated.
const TABS = [
  { key: 'pending', label: 'Pending Invoices' },
  { key: 'paid', label: 'Paid Invoices' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function InvoicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has } = usePermissions();
  const canExport = has('export_accounting');
  const listRef = useRef<InvoiceListPageHandle>(null);

  const tabParam = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = tabParam === 'paid' ? 'paid' : 'pending';

  const setTab = (next: TabKey) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', next);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Invoices</h1>
            <div className="overflow-x-auto">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <button onClick={() => listRef.current?.exportCsv()} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
                <ArrowDownTrayIcon className="h-4 w-4" /> Export
              </button>
            )}
            {tab === 'pending' && (
              <button onClick={() => listRef.current?.openCreateDrawer()} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                <PlusIcon className="h-4 w-4" /> New Invoice
              </button>
            )}
          </div>
        </div>
        <p className="text-slate-500 text-sm sm:text-base">Track pending and paid customer invoices</p>
      </div>

      {tab === 'paid' ? <InvoiceListPage key="paid" ref={listRef} mode="paid" hideHeading /> : <InvoiceListPage key="pending" ref={listRef} mode="open" hideHeading />}
    </div>
  );
}
