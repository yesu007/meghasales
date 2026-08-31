-- Data-only (no schema changes) — same convention as
-- 20260828120100_seed_expense_budget_permissions. Package is a general-
-- purpose master like Vertical (own module, not accounting-specific);
-- view_packages is granted to every role that can already view_demos
-- (the one place Package is consumed today), manage_packages mirrors
-- manage_verticals' ADMIN/MANAGEMENT-only roster.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_packages', 'View the package master list', 'PACKAGES'),
  ('manage_packages', 'Create/edit/deactivate packages', 'PACKAGES')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_packages'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_packages'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed the five packages named in the request so the Demo form has real
-- options from day one instead of an empty picklist. updated_at has no DB
-- default (fresh CREATE TABLE, unlike verticals' backfilled-then-defaulted
-- column) so it's set explicitly here.
INSERT INTO packages (name, code, sort_order, updated_at)
VALUES
  ('Trading', 'TRADING', 1, CURRENT_TIMESTAMP),
  ('Jewellery Manufacturing', 'JEWELLERY_MFG', 2, CURRENT_TIMESTAMP),
  ('Trading + Accounts', 'TRADING_ACCOUNTS', 3, CURRENT_TIMESTAMP),
  ('Retail', 'RETAIL', 4, CURRENT_TIMESTAMP),
  ('Custom Project', 'CUSTOM_PROJECT', 5, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;
