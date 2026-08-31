-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. Closes the gap noted in the BRD compliance audit: RBAC
-- naming only covered view_x/manage_x, with no distinct export_x family,
-- so "may see this data" and "may take it out of the app" were the same
-- permission everywhere. module/name values mirror the corresponding
-- view_x permission's own module exactly.
--
-- Role grants mirror each module's existing view_x/manage_x roster (same
-- audience that could already reach the export button/route, just without
-- a dedicated permission gating it) — a starting default, not new policy,
-- editable afterward through the Roles & Permissions admin UI.
INSERT INTO permissions (name, description, module)
VALUES
  ('export_quotations', 'Download quotation PDFs', 'QUOTATIONS'),
  ('export_payroll', 'Export payroll reports and download payslip PDFs', 'PAYROLL'),
  ('export_accounting', 'Export accounting reports, invoice lists, and customer ledgers', 'ACCOUNTING'),
  ('export_audit_logs', 'Export the audit log as CSV', 'AUDIT'),
  ('export_meeting_reports', 'Export the action-item report as CSV', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- export_quotations — same roster as view_quotations (ADMIN implicit + MANAGEMENT/SALES/FINANCE).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'export_quotations'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'SALES', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- export_payroll — same roster as view_payroll (ADMIN/MANAGEMENT/FINANCE).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'export_payroll'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- export_accounting — same roster as view_accounting (ADMIN/MANAGEMENT/FINANCE).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'export_accounting'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- export_audit_logs — same roster as view_audit_logs (ADMIN implicit + DEVOPS).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'export_audit_logs'
  AND r.name IN ('ADMIN', 'DEVOPS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- export_meeting_reports — same roster as view_meeting_reports (ADMIN/MANAGEMENT).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'export_meeting_reports'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;
