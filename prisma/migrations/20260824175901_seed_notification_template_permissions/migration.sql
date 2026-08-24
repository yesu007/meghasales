-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. manage_notification_templates gates editing the copy
-- SLA reminders and MOM/meeting event notifications render through
-- (Settings → Notification Templates) — an oversight-level capability, so
-- it goes to the same two roles that already hold MOM-approval authority
-- rather than the broader set of roles that can merely author/assign
-- meetings and action items. Grants below are sane starting defaults, not
-- fixed policy — editable afterward through the Roles & Permissions admin
-- UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('manage_notification_templates', 'Edit the subject/body of SLA reminder and meeting/MOM event notification templates', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — belt-and-suspenders alongside requirePermission()'s implicit
-- ADMIN bypass, same as every other module's seed migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name = 'manage_notification_templates'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — the same oversight role that already approves/publishes MOMs.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name = 'manage_notification_templates'
ON CONFLICT (role_id, permission_id) DO NOTHING;
