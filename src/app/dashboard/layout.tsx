'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  ClipboardDocumentCheckIcon,
  BanknotesIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { TEKFILO_LOGO } from '@/lib/logo';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';

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
  ...(isAdminTicketModuleEnabled()
    ? [{ href: '/dashboard/admin-ticket', label: 'Admin Tickets', icon: ClipboardDocumentCheckIcon }]
    : []),
  { href: '/dashboard/users', label: 'Users', icon: UserGroupIcon },
  { href: '/dashboard/notifications', label: 'Notifications', icon: BellIcon },
  { href: '/dashboard/audit-log', label: 'Audit Report', icon: ClipboardDocumentListIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const activeParent = NAV_ITEMS.find((item) => 'children' in item && item.children && pathname.startsWith(item.href));
    if (activeParent) setExpandedGroups((prev) => new Set(prev).add(activeParent.href));
  }, [pathname]);

  // Close the mobile nav drawer on navigation — otherwise it stays open
  // over the new page after tapping a link.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      {/* Mobile nav backdrop — only rendered below md, where the sidebar is
          an overlay drawer instead of a static column */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Sidebar — static in-flow column at md+ (unchanged from before),
          a slide-in overlay drawer below md */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-200 ease-in-out overflow-y-auto md:static md:z-auto md:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-700 flex items-start justify-between">
          <div>
            <div className="bg-white rounded-lg px-3 py-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TEKFILO_LOGO} alt="Tekfilo" className="h-6 w-auto" />
            </div>
            <p className="text-xs text-slate-400 mt-2">MeghaSales CRM</p>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 -mr-2 -mt-1 text-slate-400 hover:text-white" aria-label="Close menu">
            <XMarkIcon className="h-6 w-6" />
          </button>
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
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Menu */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between md:justify-end px-4 sm:px-6 lg:px-8">
          <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900" aria-label="Open menu">
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-3"
            >
              <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {session.user?.name?.[0] || 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-slate-800">{session.user?.name}</p>
                <p className="text-xs text-slate-500">{(session.user as any)?.role}</p>
              </div>
              <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-red-600 transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
