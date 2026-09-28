// Single source of truth for the Module → Page → Action permission
// hierarchy. Pure data (no server-only imports) so the Roles screen, the
// sidebar, the dashboard route guard and the seed/migration generator all
// read the same table.
//
// Naming follows the existing convention: view_<page> / create_<page> /
// edit_<page> / delete_<page>. The old catch-all manage_<page> permissions
// were split into create/edit/delete (see the
// split_manage_into_create_edit_delete migration, which granted each new
// permission to every role that held the permission(s) in `from`, so no
// role gained or lost access on deploy). Workflow permissions that aren't
// plain CRUD (approve_*, export_*, publish_mom, run_payroll, …) stay as
// `extra` checkboxes on their page's row.
//
// `paths` are the dashboard URLs whose access the page's view permission
// controls (matched as the path itself or anything under it, longest match
// wins — see getRequiredViewPermission; a leading `=` means that exact URL
// only, and `[id]` matches one numeric segment). A page with no paths is a
// resource managed from inside another page (e.g. Lead Events inside a
// Lead) and appears only in the Roles screen.

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];

export interface CatalogPermission {
  name: string;
  description: string;
  // Existing permissions whose holders were granted this one by the
  // migration. Omitted for permissions that already existed.
  from?: string[];
}

export interface CatalogPage {
  key: string;
  label: string;
  paths?: string[];
  actions: Partial<Record<PermissionAction, CatalogPermission>>;
  extra?: CatalogPermission[];
}

export interface CatalogModule {
  key: string;
  label: string;
  pages: CatalogPage[];
}

// Builds the standard view/create/edit/delete set for a page. `legacy`
// names the old manage_* permission the new create/edit/delete replace
// (their grants come from it); `view` defaults to view_<key>.
function crud(
  key: string,
  label: string,
  opts: {
    paths?: string[];
    legacy?: string | string[];
    view?: CatalogPermission | null;
    actions?: PermissionAction[];
    extra?: CatalogPermission[];
  } = {},
): CatalogPage {
  const legacy = opts.legacy === undefined ? [`manage_${key}`] : Array.isArray(opts.legacy) ? opts.legacy : [opts.legacy];
  const wanted = opts.actions ?? ['create', 'edit', 'delete'];
  const noun = label.toLowerCase();
  const actions: CatalogPage['actions'] = {};
  if (opts.view !== null) actions.view = opts.view ?? { name: `view_${key}`, description: `View ${noun}` };
  if (wanted.includes('create')) actions.create = { name: `create_${key}`, description: `Create ${noun}`, from: legacy };
  if (wanted.includes('edit')) actions.edit = { name: `edit_${key}`, description: `Edit ${noun}`, from: legacy };
  if (wanted.includes('delete')) actions.delete = { name: `delete_${key}`, description: `Delete ${noun}`, from: legacy };
  return { key, label, paths: opts.paths, actions, extra: opts.extra };
}

const existing = (name: string, description: string): CatalogPermission => ({ name, description });
const newView = (name: string, description: string, from: string[]): CatalogPermission => ({ name, description, from });

export const PERMISSION_CATALOG: CatalogModule[] = [
  {
    key: 'DASHBOARD',
    label: 'Dashboard',
    pages: [
      { key: 'dashboard', label: 'Dashboard', paths: ['=/dashboard'], actions: { view: existing('view_dashboard', 'View the Dashboard home page') } },
    ],
  },
  {
    key: 'MASTERS',
    label: 'Masters',
    pages: [
      crud('verticals', 'Verticals', { paths: ['/dashboard/verticals'] }),
      crud('projects', 'Projects', { paths: ['/dashboard/projects'] }),
      crud('products', 'Products', { paths: ['/dashboard/products'] }),
      crud('packages', 'Packages', { paths: ['/dashboard/packages'] }),
      crud('lead_sources', 'Lead Sources', { paths: ['/dashboard/lead-sources'] }),
      crud('lead_status_options', 'Lead Statuses', { paths: ['/dashboard/lead-statuses'], actions: ['create', 'edit'] }),
      crud('stages', 'Stages', { paths: ['/dashboard/stages'] }),
    ],
  },
  {
    key: 'SALES',
    label: 'Sales',
    pages: [
      crud('leads', 'Leads', {
        paths: ['/dashboard/leads'],
        extra: [
          existing('delete_nda_documents', 'Delete NDA documents on a lead'),
          { name: 'override_currency', description: "Override a country's default currency on leads and customers", from: [] },
        ],
      }),
      crud('lead_events', 'Lead Events & Documents', {
        extra: [existing('add_lead_discussion', 'Add discussions to lead events')],
      }),
      crud('customers', 'Customers', {
        paths: ['/dashboard/customers'],
        legacy: 'manage_leads',
        view: newView('view_customers', 'View customers', ['view_leads']),
      }),
      crud('companies', 'Companies'),
      crud('quotations', 'Quotations', {
        paths: ['/dashboard/quotations'],
        extra: [
          existing('export_quotations', 'Export quotations'),
          existing('authorize_quotation_override', 'Authorize quotation price overrides'),
        ],
      }),
      crud('demos', 'Demos', { paths: ['/dashboard/demos'] }),
      crud('implementations', 'Implementations', { paths: ['/dashboard/implementations'] }),
    ],
  },
  {
    key: 'MEETINGS',
    label: 'Meetings',
    pages: [
      crud('meetings', 'To Do (Meetings)', { paths: ['/dashboard/todo'], actions: ['create', 'edit'] }),
      crud('mom', 'Minutes of Meeting', {
        view: null,
        actions: ['create', 'edit'],
        extra: [existing('approve_mom', 'Approve minutes of meeting'), existing('publish_mom', 'Publish minutes of meeting')],
      }),
      {
        key: 'action_items',
        label: 'Action Items',
        paths: ['/dashboard/action-items'],
        actions: { view: newView('view_action_items', 'View action items', ['view_meetings']) },
        extra: [
          existing('assign_action_items', 'Create and assign action items'),
          existing('manage_own_action_items', 'Update own action items'),
          existing('close_action_items', 'Close action items'),
          existing('verify_action_items', 'Verify action items'),
          existing('reopen_action_items', 'Reopen action items'),
        ],
      },
      {
        key: 'meetings_dashboard',
        label: 'Meetings Dashboard',
        paths: ['/dashboard/meetings/dashboard'],
        actions: { view: newView('view_meetings_dashboard', 'View the meetings dashboard', ['view_meetings']) },
        extra: [existing('view_meeting_team_dashboard', 'View the team-wide meetings dashboard')],
      },
      {
        key: 'meeting_reports',
        label: 'Meeting Reports',
        paths: ['/dashboard/meetings/reports'],
        actions: { view: existing('view_meeting_reports', 'View meeting reports') },
        extra: [existing('export_meeting_reports', 'Export meeting reports')],
      },
    ],
  },
  {
    key: 'FINANCE',
    label: 'Finance',
    pages: [
      { key: 'accounting', label: 'Accounting Dashboard', paths: ['/dashboard/accounting'], actions: { view: existing('view_accounting', 'View the accounting dashboard') } },
      crud('invoices', 'Invoices', {
        paths: ['/dashboard/accounting/invoices', '/dashboard/accounting/paid-invoices', '/dashboard/accounting/pending-invoices', '/dashboard/customers/[id]/invoices'],
        view: newView('view_invoices', 'View invoices and credit notes', ['view_accounting']),
      }),
      crud('payments', 'Payments', { view: null }),
      crud('payment_reminders', 'Payment Reminders', {
        paths: ['/dashboard/accounting/payment-reminders'],
        view: newView('view_payment_reminders', 'View payment reminders', ['view_accounting']),
        legacy: ['manage_invoices', 'manage_payments'],
      }),
      {
        key: 'customer_ledger',
        label: 'Customer Ledger',
        paths: ['/dashboard/accounting/customer-ledger'],
        actions: { view: newView('view_customer_ledger', 'View the customer ledger', ['view_accounting']) },
      },
      {
        key: 'accounting_reports',
        label: 'Accounting Reports',
        paths: ['/dashboard/accounting/reports'],
        actions: { view: newView('view_accounting_reports', 'View accounting reports', ['view_accounting']) },
        extra: [existing('export_accounting', 'Export accounting data')],
      },
      crud('bills', 'Bills', {
        paths: ['/dashboard/bills'],
        legacy: 'manage_expenses',
        view: newView('view_bills', 'View bills and suppliers', ['view_expenses']),
      }),
      crud('expenses', 'Expenses', { paths: ['/dashboard/expenses'] }),
      crud('expense_budgets', 'Expense Budgets', { paths: ['/dashboard/expense-budgets'] }),
      {
        key: 'reimbursement_approvals',
        label: 'Reimbursement Approvals',
        paths: ['/dashboard/payroll/expense-claims'],
        actions: {},
        extra: [existing('approve_expense_claims', 'Review, approve, reject and pay employee expense claims')],
      },
    ],
  },
  {
    key: 'PAYROLL',
    label: 'Payroll',
    pages: [
      crud('employees', 'Employees', {
        paths: ['=/dashboard/payroll', '/dashboard/payroll/[id]'],
        view: newView('view_employees', 'View employees', ['view_payroll']),
      }),
      crud('salary_structures', 'Salary Structures', {
        paths: ['/dashboard/payroll/structures'],
        view: newView('view_salary_structures', 'View salary structures', ['view_payroll']),
        actions: ['create', 'edit'],
      }),
      {
        key: 'payroll',
        label: 'Payroll Runs',
        paths: ['/dashboard/payroll/runs'],
        actions: { view: existing('view_payroll', 'View payroll runs and payslips') },
        extra: [
          existing('run_payroll', 'Create, regenerate and edit payroll runs'),
          existing('approve_payroll', 'Approve payroll runs'),
        ],
      },
      crud('timesheet', 'Time & Attendance', {
        paths: ['/dashboard/payroll/timesheet', '/dashboard/payroll/leave'],
        view: newView('view_timesheet', 'View time & attendance, leave requests and holidays', ['view_payroll']),
        legacy: ['manage_employees', 'manage_salary_structures'],
        extra: [existing('approve_leave', 'Approve or reject leave requests')],
      }),
      crud('shifts', 'Shift Master', {
        paths: ['/dashboard/payroll/shifts'],
        view: newView('view_shifts', 'View shifts', ['view_payroll']),
        legacy: 'manage_employees',
      }),
      crud('loans', 'Loans & Advances', {
        paths: ['/dashboard/payroll/loans'],
        view: newView('view_loans', 'View loans & advances', ['view_payroll']),
        legacy: 'manage_employees',
        actions: ['create', 'edit'],
      }),
      crud('salary_allocation', 'Salary Allocation', {
        paths: ['/dashboard/payroll/salary-allocation'],
        view: newView('view_salary_allocation', 'View salary allocation', ['view_payroll']),
        legacy: 'manage_employees',
        actions: ['edit'],
      }),
      {
        key: 'payroll_reports',
        label: 'Payroll Reports',
        paths: ['/dashboard/payroll/reports'],
        actions: { view: newView('view_payroll_reports', 'View payroll reports', ['view_payroll']) },
        extra: [existing('export_payroll', 'Export payroll data')],
      },
      crud('statutory_settings', 'Statutory Settings', {
        paths: ['/dashboard/payroll/statutory'],
        view: newView('view_statutory_settings', 'View statutory settings', ['view_payroll']),
        legacy: 'manage_salary_structures',
        actions: ['create', 'edit'],
      }),
    ],
  },
  {
    key: 'REPORTS',
    label: 'Reports',
    pages: [
      { key: 'reports', label: 'Reports', paths: ['/dashboard/reports'], actions: { view: existing('view_reports', 'View the reports hub') } },
    ],
  },
  {
    key: 'MY_SPACE',
    label: 'My Space',
    pages: [
      {
        key: 'my_space',
        label: 'My Space',
        actions: {},
        extra: [existing('my_space', 'My Space access'), existing('my_leave', 'My Leave'), existing('my_payslips', 'My Payslips')],
      },
    ],
  },
  {
    key: 'ADMINISTRATION',
    label: 'Administration',
    pages: [
      crud('admin_tickets', 'Admin Tickets', { paths: ['/dashboard/admin-ticket'], actions: ['create', 'edit'] }),
      crud('users', 'Users', { paths: ['/dashboard/users'] }),
      crud('roles', 'Roles & Permissions', { paths: ['/dashboard/roles'] }),
      {
        key: 'audit_logs',
        label: 'Audit Report',
        paths: ['/dashboard/audit-log'],
        actions: { view: existing('view_audit_logs', 'View the audit report') },
        extra: [existing('export_audit_logs', 'Export the audit report')],
      },
    ],
  },
  {
    key: 'SETTINGS',
    label: 'Settings',
    pages: [
      {
        key: 'settings',
        label: 'Company Settings',
        actions: { edit: { name: 'edit_settings', description: 'Edit company profile settings', from: ['manage_countries'] } },
      },
      crud('countries', 'Countries', { view: null }),
      crud('email_settings', 'Email Settings', {
        view: newView('view_email_settings', 'View outbound email (SMTP) settings', ['manage_email_settings']),
        actions: ['edit'],
      }),
      crud('notification_templates', 'Notification Templates', {
        view: newView('view_notification_templates', 'View notification templates', ['manage_notification_templates']),
        actions: ['edit'],
      }),
    ],
  },
];

// Old catch-all permissions removed by the migration — fully replaced by
// the create/edit/delete (and, for email/notification settings, view)
// permissions above.
export const RETIRED_PERMISSIONS = [
  'manage_verticals', 'manage_projects', 'manage_products', 'manage_packages', 'manage_lead_sources',
  'manage_lead_status_options', 'manage_stages', 'manage_leads', 'manage_lead_events', 'manage_companies',
  'manage_quotations', 'manage_demos', 'manage_implementations', 'manage_meetings', 'manage_mom',
  'manage_invoices', 'manage_payments', 'manage_expenses', 'manage_expense_budgets', 'manage_employees',
  'manage_salary_structures', 'manage_admin_tickets', 'manage_users', 'manage_roles', 'manage_countries',
  'manage_email_settings', 'manage_notification_templates',
];

export function catalogPermissions(): (CatalogPermission & { module: string; page: string; action: string; sortOrder: number })[] {
  const out: (CatalogPermission & { module: string; page: string; action: string; sortOrder: number })[] = [];
  let sortOrder = 0;
  for (const mod of PERMISSION_CATALOG) {
    for (const page of mod.pages) {
      for (const action of PERMISSION_ACTIONS) {
        const perm = page.actions[action];
        if (perm) out.push({ ...perm, module: mod.label, page: page.label, action, sortOrder: sortOrder++ });
      }
      for (const perm of page.extra ?? []) out.push({ ...perm, module: mod.label, page: page.label, action: 'other', sortOrder: sortOrder++ });
    }
  }
  return out;
}

// Dashboard route → the view permission that gates it (longest matching
// catalog path wins; `[id]` segments match any single segment). Returns
// undefined for routes with no catalog entry (personal pages such as My
// Space, Notifications, Change Password, Settings), which stay open to
// every logged-in user.
export function getRequiredViewPermission(pathname: string): string | undefined {
  let best: { length: number; permission: string } | undefined;
  for (const mod of PERMISSION_CATALOG) {
    for (const page of mod.pages) {
      const gate = page.actions.view?.name ?? page.extra?.[0]?.name;
      if (!gate) continue;
      for (const raw of page.paths ?? []) {
        const exactOnly = raw.startsWith('=');
        const path = exactOnly ? raw.slice(1) : raw;
        const pattern = new RegExp(`^${path.replace(/\[[^\]]+\]/g, '\\d+')}${exactOnly ? '' : '(/.*)?'}$`);
        if (pattern.test(pathname) && (!best || path.length > best.length)) best = { length: path.length, permission: gate };
      }
    }
  }
  return best?.permission;
}
