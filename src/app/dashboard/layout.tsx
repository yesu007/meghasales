'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HomeIcon,
  UsersIcon,
  DocumentTextIcon,
  CalendarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  BellIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { TEKFILO_LOGO } from '@/lib/logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/dashboard/leads', label: 'Leads', icon: UsersIcon },
  { href: '/dashboard/quotations', label: 'Quotations', icon: DocumentTextIcon },
  { href: '/dashboard/demos', label: 'Demos', icon: CalendarIcon },
  { href: '/dashboard/implementations', label: 'Implementations', icon: WrenchScrewdriverIcon },
  {
    href: '/dashboard/accounting', label: 'Accounting', icon: BanknotesIcon,
    children: [
      { href: '/dashboard/accounting', label: 'Dashboard' },
      { href: '/dashboard/accounting/pending-invoices', label: 'Pending Invoices' },
      { href: '/dashboard/accounting/paid-invoices', label: 'Paid Invoices' },
      { href: '/dashboard/accounting/payment-reminders', label: 'Payment Reminders' },
      { href: '/dashboard/accounting/customer-ledger', label: 'Customer Ledger' },
      { href: '/dashboard/accounting/reports', label: 'Reports' },
    ],
  },
  { href: '/dashboard/users', label: 'Users', icon: UserGroupIcon },
  { href: '/dashboard/notifications', label: 'Notifications', icon: BellIcon },
  { href: '/dashboard/audit-log', label: 'Audit Report', icon: ClipboardDocumentListIcon },
  { href: '/dashboard/settings', label: 'Settings', icon: Cog6ToothIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const activeParent = NAV_ITEMS.find((item) => 'children' in item && item.children && pathname.startsWith(item.href));
    if (activeParent) setExpandedGroups((prev) => new Set(prev).add(activeParent.href));
  }, [pathname]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <div className="bg-white rounded-lg px-3 py-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TEKFILO_LOGO} alt="Tekfilo" className="h-6 w-auto" />
          </div>
          <p className="text-xs text-slate-400 mt-2">MeghaSales CRM</p>
        </div>

        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

            if ('children' in item && item.children) {
              const isExpanded = expandedGroups.has(item.href);
              return (
                <div key={item.href}>
                  <button
                    onClick={() => setExpandedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.href)) next.delete(item.href); else next.add(item.href);
                      return next;
                    })}
                    className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                      isActive ? 'text-amber-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="pb-1">
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block pl-12 pr-6 py-2 text-sm transition-colors ${
                              isChildActive ? 'bg-slate-800 text-amber-400 border-r-2 border-amber-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive ? 'bg-slate-800 text-amber-400 border-r-2 border-amber-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center text-sm font-bold">
              {session.user?.name?.[0] || 'U'}
            </div>
            <div>
              <p className="text-sm font-medium">{session.user?.name}</p>
              <p className="text-xs text-slate-400">{(session.user as any)?.role}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
