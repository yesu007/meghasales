-- Data-only (no schema changes) — the same convention as the earlier
-- payroll/admin-ticket permission seeds. New permission for leave
-- approval, plus starter leave types so a fresh install isn't starting
-- with an empty, unusable leave-type table.
INSERT INTO permissions (name, description, module)
VALUES ('approve_leave', 'Approve or reject employee leave requests', 'PAYROLL')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'approve_leave'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO leave_types (name, code, is_paid, annual_quota, updated_at)
SELECT v.name, v.code, v.is_paid, v.annual_quota, CURRENT_TIMESTAMP
FROM (VALUES
  ('Casual Leave', 'CASUAL', true, 12),
  ('Sick Leave', 'SICK', true, 12),
  ('Earned Leave', 'EARNED', true, 15),
  ('Loss of Pay', 'LOP', false, NULL)
) AS v(name, code, is_paid, annual_quota)
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE code = v.code);
