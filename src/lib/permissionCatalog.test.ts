import { describe, expect, it } from 'vitest';
import { catalogPermissions, getRequiredViewPermission, RETIRED_PERMISSIONS } from './permissionCatalog';

describe('getRequiredViewPermission', () => {
  it.each([
    ['/dashboard', 'view_dashboard'],
    ['/dashboard/leads', 'view_leads'],
    ['/dashboard/leads/12', 'view_leads'],
    ['/dashboard/customers/5', 'view_customers'],
    ['/dashboard/customers/5/invoices/9', 'view_invoices'],
    ['/dashboard/accounting', 'view_accounting'],
    ['/dashboard/accounting/invoices/3', 'view_invoices'],
    ['/dashboard/payroll', 'view_employees'],
    ['/dashboard/payroll/42', 'view_employees'],
    ['/dashboard/payroll/runs/7', 'view_payroll'],
    ['/dashboard/payroll/expense-claims', 'approve_expense_claims'],
    ['/dashboard/meetings/reports', 'view_meeting_reports'],
  ])('%s → %s', (path, perm) => {
    expect(getRequiredViewPermission(path)).toBe(perm);
  });

  it.each(['/dashboard/payroll/my-payslips', '/dashboard/payroll/my-leave', '/dashboard/notifications', '/dashboard/change-password', '/dashboard/settings'])(
    '%s stays open to every logged-in user',
    (path) => {
      expect(getRequiredViewPermission(path)).toBeUndefined();
    },
  );
});

describe('catalog', () => {
  it('has no duplicate permission names', () => {
    const names = catalogPermissions().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never lists a retired permission', () => {
    const names = new Set(catalogPermissions().map((p) => p.name));
    expect(RETIRED_PERMISSIONS.filter((r) => names.has(r))).toEqual([]);
  });
});
