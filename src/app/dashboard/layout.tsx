'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  CurrencyRupeeIcon,
  WalletIcon,
  CalendarDaysIcon,
  ReceiptPercentIcon,
  ChartPieIcon,
  ChartBarSquareIcon,
  BuildingOffice2Icon,
  CubeIcon,
  MegaphoneIcon,
  FlagIcon,
  IdentificationIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { TEKFILO_LOGO } from '@/lib/logo';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { hasAnyPermission } from '@/lib/permissions';

interface NavChild {
  href: string;
  label: string;
  permission?: string | string[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string | string[];
  children?: NavChild[];
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

// Grouped into labeled sections (rather than one flat list) so the nav
// reads as a map of the app instead of a dozen equally-weighted rows — and
// nested under compact headers so the whole thing fits in less vertical
// space. Each item can carry a `permission` (single string or array —
// array means "any of"); an item with none is always visible once its
// section is reached (e.g. Dashboard home, personal Notifications).
// Feature flags (isPayrollModuleEnabled, isAdminTicketModuleEnabled,
// isMeetingsModuleEnabled) are a separate, build-time AND-condition on top
// of the permission check.
function getNavItems(): NavSection[] {
  return [
    {
      title: null,
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
      ],
    },
    {
      // Admin-configurable lookup tables other modules draw their picklists
      // from — grouped here as their own section (instead of scattered
      // inline among the modules that consume them) since they're setup/
      // reference data an admin configures once, not day-to-day workflow
      // items like Leads/Quotations below.
      title: 'Masters',
      items: [
        { href: '/dashboard/verticals', label: 'Verticals', icon: BuildingOffice2Icon, permission: 'view_verticals' },
        { href: '/dashboard/projects', label: 'Project', icon: ClipboardDocumentListIcon, permission: 'view_projects' },
        { href: '/dashboard/packages', label: 'Packages', icon: CubeIcon, permission: 'view_packages' },
        { href: '/dashboard/lead-sources', label: 'Lead Sources', icon: MegaphoneIcon, permission: 'view_lead_sources' },
        { href: '/dashboard/lead-statuses', label: 'Lead Statuses', icon: FlagIcon, permission: 'view_lead_status_options' },
      ],
    },
    {
      title: 'Sales',
      items: [
        { href: '/dashboard/leads', label: 'Leads', icon: UsersIcon, permission: 'view_leads' },
        // Customers are Leads with status=Converted — no separate entity —
        // so this reuses the exact same view_leads/manage_leads permissions
        // as the Leads item above rather than a new permission.
        { href: '/dashboard/customers', label: 'Customers', icon: IdentificationIcon, permission: 'view_leads' },
        { href: '/dashboard/quotations', label: 'Quotations', icon: DocumentTextIcon, permission: 'view_quotations' },
        { href: '/dashboard/demos', label: 'Demos', icon: CalendarIcon, permission: 'view_demos' },
        { href: '/dashboard/implementations', label: 'Implementations', icon: WrenchScrewdriverIcon, permission: 'view_implementations' },
        ...(isMeetingsModuleEnabled()
          ? [{
              href: '/dashboard/todo', label: 'Meetings', icon: CalendarDaysIcon, permission: 'view_meetings',
              children: [
                { href: '/dashboard/todo', label: 'To Do' },
                { href: '/dashboard/action-items', label: 'Action Items' },
                { href: '/dashboard/meetings/dashboard', label: 'Dashboard' },
                { href: '/dashboard/meetings/reports', label: 'Reports', permission: 'view_meeting_reports' },
              ],
            }]
          : []),
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          href: '/dashboard/accounting', label: 'Accounting', icon: BanknotesIcon, permission: 'view_accounting',
          children: [
            { href: '/dashboard/accounting', label: 'Dashboard' },
            { href: '/dashboard/accounting/pending-invoices', label: 'Pending Invoices' },
            { href: '/dashboard/accounting/paid-invoices', label: 'Paid Invoices' },
            { href: '/dashboard/accounting/payment-reminders', label: 'Payment Reminders' },
            { href: '/dashboard/accounting/customer-ledger', label: 'Customer Ledger' },
            { href: '/dashboard/accounting/reports', label: 'Reports' },
          ],
        },
        { href: '/dashboard/expenses', label: 'Expenses', icon: ReceiptPercentIcon, permission: 'view_expenses' },
        { href: '/dashboard/expense-budgets', label: 'Expense Budgets', icon: ChartPieIcon, permission: 'view_expense_budgets' },
        // Employees/Salary Structures/Runs expose everyone's salary data,
        // not just the viewer's own, so this needs view_payroll on top of
        // the module being enabled at all.
        ...(isPayrollModuleEnabled()
          ? [{
              href: '/dashboard/payroll', label: 'Payroll', icon: CurrencyRupeeIcon, permission: 'view_payroll',
              children: [
                { href: '/dashboard/payroll', label: 'Employees' },
                { href: '/dashboard/payroll/structures', label: 'Salary Structures' },
                { href: '/dashboard/payroll/runs', label: 'Payroll Runs' },
                { href: '/dashboard/payroll/timesheet', label: 'Time & Attendance' },
                { href: '/dashboard/payroll/loans', label: 'Loans & Advances' },
                { href: '/dashboard/payroll/reports', label: 'Reports' },
                { href: '/dashboard/payroll/statutory', label: 'Statutory Settings' },
              ],
            }]
          : []),
      ],
    },
    // Cross-module reporting. Deliberately its own section rather than a
    // child of Finance: reports here span Sales/Finance/People, and the
    // module-owned report pages (Accounting → Reports, Payroll → Reports,
    // Meetings → Reports, Audit Report) stay exactly where they are — this
    // section only ever lists reports built under /dashboard/reports. The
    // hub page filters its own catalog by permission, so a viewer holding
    // view_reports but nothing else sees an empty catalog rather than a 403.
    {
      title: 'Reports',
      items: [
        { href: '/dashboard/reports', label: 'Reports', icon: ChartBarSquareIcon, permission: 'view_reports' },
      ],
    },
    {
      title: 'My Space',
      items: isPayrollModuleEnabled()
        ? [
            { href: '/dashboard/payroll/my-payslips', label: 'My Payslips', icon: WalletIcon },
            { href: '/dashboard/payroll/my-leave', label: 'My Leave', icon: CalendarDaysIcon },
          ]
        : [],
    },
    {
      title: 'Administration',
      items: [
        ...(isAdminTicketModuleEnabled()
          ? [{ href: '/dashboard/admin-ticket', label: 'Admin Tickets', icon: ClipboardDocumentCheckIcon, permission: 'view_admin_tickets' }]
          : []),
        { href: '/dashboard/users', label: 'Users', icon: UserGroupIcon, permission: ['view_users', 'manage_users'] },
        { href: '/dashboard/roles', label: 'Roles', icon: Cog6ToothIcon, permission: ['view_roles', 'manage_roles'] },
        { href: '/dashboard/notifications', label: 'Notifications', icon: BellIcon },
        { href: '/dashboard/audit-log', label: 'Audit Report', icon: ClipboardDocumentListIcon, permission: 'view_audit_logs' },
      ],
    },
  ];
}

function isAllowed(roles: string[], permissions: string[], required?: string | string[]) {
  if (!required) return true;
  return hasAnyPermission(roles, permissions, Array.isArray(required) ? required : [required]);
}

// A route is "under" a nav href if it IS that href, or nested one segment
// deeper (matching on a `/` boundary so e.g. '/dashboard/todo-extra' isn't
// mistaken for a match). Used for both the active-highlight and the
// auto-expand-on-navigate effect below.
function isPathUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Whether a nav item (leaf or group) should render as "active" — a group
// is active when the current route matches ANY of its children, not just
// the group's own href, since a group's children don't necessarily share
// its href as a path prefix (e.g. the Meetings group's own href is
// /dashboard/todo, but /dashboard/action-items is one of its children).
function isNavItemActive(pathname: string, item: NavItem): boolean {
  if ('children' in item && item.children) {
    return item.children.some((child) => isPathUnder(pathname, child.href));
  }
  return item.href === '/dashboard' ? pathname === item.href : isPathUnder(pathname, item.href);
}

// Filters the declarative nav table above by the logged-in user's roles/
// permissions, then drops any section left with zero items — replaces the
// one-off canViewPayroll check with the same rule applied to every item.
// Children get the same treatment as top-level items (a child with no
// `permission` inherits visibility from its already-gated parent; one with
// its own — e.g. Meetings > Reports needing view_meeting_reports on top of
// the parent's view_meetings — is filtered independently).
function getNavSections(roles: string[], permissions: string[]) {
  return getNavItems()
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => isAllowed(roles, permissions, item.permission))
        .map((item) => ('children' in item && item.children
          ? { ...item, children: item.children.filter((child) => isAllowed(roles, permissions, child.permission)) }
          : item)),
    }))
    // Sections collapse away entirely when every item inside is gated off
    // (e.g. "My Space" with the Payroll module disabled) rather than
    // rendering a header over nothing.
    .filter((section) => section.items.length > 0);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const roles = session?.user?.roles || [];
  const permissions = session?.user?.permissions || [];
  // session.user.roles/permissions are new array references every render
  // (even when unchanged), so memoize on a joined string of their contents
  // instead — otherwise navSections/navItems would be new arrays every
  // render, and the effect below (which needs navItems in its deps to react
  // to a session that resolves after first paint) would re-run and
  // re-setState every single render.
  const rolesKey = roles.join(',');
  const permissionsKey = permissions.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
  // keyed on the joined strings above, not the roles/permissions arrays
  // themselves (see comment above).
  const navSections = useMemo(() => getNavSections(roles, permissions), [rolesKey, permissionsKey]);
  const navItems = useMemo(() => navSections.flatMap((section) => section.items), [navSections]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const activeParent = navItems.find((item) => 'children' in item && item.children && isNavItemActive(pathname, item));
    if (activeParent) setExpandedGroups((prev) => new Set(prev).add(activeParent.href));
    // navItems itself depends on session (canViewPayroll), so it needs to
    // be in this list too — otherwise the Payroll group wouldn't
    // auto-expand if the session (and thus the permission check) resolves
    // after the initial render.
  }, [pathname, navItems]);

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
        <div className="p-4 border-b border-slate-700 flex items-start justify-between">
          <div>
            <div className="bg-white rounded-lg px-2.5 py-1.5 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TEKFILO_LOGO} alt="Tekfilo" className="h-5 w-auto" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">MeghaSales CRM</p>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 -mr-2 -mt-1 text-slate-400 hover:text-white" aria-label="Close menu">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {navSections.map((section, sectionIdx) => (
            <div key={section.title ?? 'top'} className={sectionIdx > 0 ? 'mt-1 pt-1 border-t border-slate-800/70' : ''}>
              {section.title && (
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
              )}
              {section.items.map((item) => {
                const isActive = isNavItemActive(pathname, item);

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
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${
                          isActive ? 'text-amber-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="pb-0.5">
                          {item.children.map((child) => {
                            const isChildActive = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`block pl-10 pr-4 py-1.5 text-[13px] transition-colors ${
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
                    className={`flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${
                      isActive ? 'bg-slate-800 text-amber-400 border-r-2 border-amber-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Menu */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between md:justify-end px-4 sm:px-6 lg:px-8">
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
                <p className="text-xs text-slate-500">{roles.join(', ')}</p>
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

        <main className="flex-1 p-4 sm:p-5 lg:p-6 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
