-- Data-only (no schema changes) — same convention as the Expense/Payroll
-- permission seeds. Adds the permission catalog needed to close the "every
-- route open to any request" gap: Users/Roles admin, core Lead CRUD writes,
-- Demos, Implementations, Quotations, and the Audit Log viewer. Grants below
-- are sane starting defaults, not fixed policy — editable afterward through
-- the new Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('view_users', 'View user accounts', 'USERS'),
  ('manage_users', 'Create/edit/delete user accounts', 'USERS'),
  ('view_roles', 'View roles and their permission grants', 'RBAC'),
  ('manage_roles', 'Create/edit/delete roles, permissions, and permission grants', 'RBAC'),
  ('manage_leads', 'Create/edit/delete lead records', 'LEADS'),
  ('view_demos', 'View scheduled and completed demos', 'DEMOS'),
  ('manage_demos', 'Create/edit/delete demos', 'DEMOS'),
  ('view_implementations', 'View implementation projects', 'IMPLEMENTATIONS'),
  ('manage_implementations', 'Create/edit/delete implementation projects', 'IMPLEMENTATIONS'),
  ('view_quotations', 'View quotations', 'QUOTATIONS'),
  ('manage_quotations', 'Create/edit/delete quotations', 'QUOTATIONS'),
  ('view_audit_logs', 'View and export the audit log', 'AUDIT')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — every new permission explicitly, belt-and-suspenders alongside
-- requirePermission()'s implicit ADMIN bypass (same pattern as every other
-- module's seed migration).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN (
    'view_users', 'manage_users', 'view_roles', 'manage_roles', 'manage_leads',
    'view_demos', 'manage_demos', 'view_implementations', 'manage_implementations',
    'view_quotations', 'manage_quotations', 'view_audit_logs'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — oversight: can see Users/Roles/Demos/Implementations/Quotations,
-- no manage rights on any of them.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name IN ('view_users', 'view_roles', 'view_demos', 'view_implementations', 'view_quotations')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- BUSINESS_ANALYST — works leads day-to-day, needs to see demos in flight.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'BUSINESS_ANALYST'
  AND p.name IN ('manage_leads', 'view_demos')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- SALES — creates/edits leads and quotations, sees demos.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SALES'
  AND p.name IN ('manage_leads', 'view_demos', 'view_quotations', 'manage_quotations')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- DEMO_TEAM — runs demos, sees the implementation pipeline they feed into.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'DEMO_TEAM'
  AND p.name IN ('view_demos', 'manage_demos', 'view_implementations')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- DEVOPS — gets audit log visibility alongside its existing admin-ticket perms.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'DEVOPS'
  AND p.name IN ('view_audit_logs')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- FINANCE — sees quotations feeding into invoicing.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'FINANCE'
  AND p.name IN ('view_quotations')
ON CONFLICT (role_id, permission_id) DO NOTHING;
