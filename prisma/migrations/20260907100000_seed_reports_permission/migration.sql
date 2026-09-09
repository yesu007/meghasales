-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. Gates the cross-module Reports hub (/dashboard/reports)
-- and its nav section.
--
-- Reports listed inside the hub keep their own, narrower permission
-- (view_expenses, view_accounting, ...). view_reports only grants reaching
-- the catalog, which then hides every row the viewer cannot actually run —
-- so granting it broadly is safe.
--
-- Grants below are sane starting defaults, not fixed policy — editable
-- afterward through the Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('view_reports', 'Open the cross-module Reports hub and run the reports listed in it that the role is otherwise permitted to see', 'REPORTS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — belt-and-suspenders alongside requirePermission()'s implicit
-- ADMIN bypass, same as every other module's seed migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'ADMIN' AND p.name = 'view_reports'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT and FINANCE — the roles that already hold view_accounting and
-- view_expense_budgets, i.e. the audience the hub is being built for.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('MANAGEMENT', 'FINANCE') AND p.name = 'view_reports'
ON CONFLICT (role_id, permission_id) DO NOTHING;
