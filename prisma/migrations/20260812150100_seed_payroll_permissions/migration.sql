-- Data-only (INSERT ... ON CONFLICT DO NOTHING, no schema changes) seed for
-- the Payroll module's permissions and role grants. Kept as a migration —
-- rather than relying solely on prisma/seed.ts, which does not run
-- automatically on deploy — so this ships with the same `prisma migrate
-- deploy` step that already runs on every production build.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_payroll', 'View employee payroll profiles, salary structures, and payroll runs', 'PAYROLL'),
  ('manage_employees', 'Create/edit employee HR and payroll profiles', 'PAYROLL'),
  ('manage_salary_structures', 'Create/edit salary components, structures, and employee assignments', 'PAYROLL'),
  ('run_payroll', 'Generate and edit a draft payroll run', 'PAYROLL'),
  ('approve_payroll', 'Approve, process, and mark a payroll run as paid', 'PAYROLL')
ON CONFLICT (name) DO NOTHING;

-- ADMIN, MANAGEMENT, and FINANCE get full payroll access — mirrors exactly
-- how the Accounting module's permissions are granted (view_accounting/
-- manage_invoices/manage_payments to the same three roles); no read-only
-- split and no new role, per the payroll plan's default for "who runs
-- payroll" pending an explicit decision otherwise.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.module = 'PAYROLL'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;
