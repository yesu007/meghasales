-- Data-only (no schema changes) — same convention as the Payroll/Leave
-- permission seeds. Grouped under module 'ACCOUNTING' since Expenses is
-- functionally the same area as Invoices/Payments (money in vs money out),
-- not a separate module — keeps the Users/Roles permission matrix grouped
-- sensibly.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_expenses', 'View business expenses', 'ACCOUNTING'),
  ('manage_expenses', 'Record/edit/delete business expenses and categories', 'ACCOUNTING')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name IN ('view_expenses', 'manage_expenses')
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;
