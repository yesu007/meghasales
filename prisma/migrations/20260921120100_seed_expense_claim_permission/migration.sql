-- Data-only — same convention as approve_leave's own seed migration.
-- Employees don't need a permission to manage their OWN draft/submitted
-- claims (self-service, scoped by session-resolved employeeId, same as
-- leave-requests/mine); this permission gates the Management review screen
-- only (view every employee's submitted claims, approve/reject, mark paid).
INSERT INTO permissions (name, description, module)
VALUES ('approve_expense_claims', 'Review, approve, reject, and mark employee expense claims as paid', 'PAYROLL')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'approve_expense_claims'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;
