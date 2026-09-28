-- Data-only — same convention as the other seed_*_permission migrations.
-- Gates the Dashboard home page (and its nav entry). Granted to every role
-- that exists today so nobody loses the Dashboard on deploy; admins can then
-- untick it per role from the Roles screen, and roles created later only get
-- it when it's explicitly ticked. ADMIN also passes via the RBAC bypass.
-- The stat cards read other modules' APIs (leads, quotations, demos,
-- implementations), which keep their own permission checks.
INSERT INTO permissions (name, description, module)
VALUES ('view_dashboard', 'View the Dashboard home page', 'DASHBOARD')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_dashboard'
ON CONFLICT (role_id, permission_id) DO NOTHING;
