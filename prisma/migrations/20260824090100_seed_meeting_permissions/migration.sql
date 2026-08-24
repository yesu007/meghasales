-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. Phase 1 of the Meeting Management module only needs
-- meeting-level permissions; MOM/action-item/SLA/notification-config
-- permissions are seeded in their own migration when those phases land.
-- Grants below are sane starting defaults, not fixed policy — editable
-- afterward through the Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('view_meetings', 'View meetings, participants, and agendas', 'MEETINGS'),
  ('manage_meetings', 'Create/edit/reschedule/cancel meetings (not just one''s own)', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — every new permission explicitly, belt-and-suspenders alongside
-- requirePermission()'s implicit ADMIN bypass (same pattern as every other
-- module's seed migration).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN ('view_meetings', 'manage_meetings')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — oversight: can see meetings, no manage rights.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name = 'view_meetings'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- BUSINESS_ANALYST, SALES, DEMO_TEAM — schedule and run meetings with leads
-- day-to-day, so they get full meeting management, not just visibility.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
  AND p.name IN ('view_meetings', 'manage_meetings')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- DEVOPS, FINANCE — visibility into internal/finance-related meetings,
-- no manage rights by default.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('DEVOPS', 'FINANCE')
  AND p.name = 'view_meetings'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- view_users was previously only granted to ADMIN/MANAGEMENT (see the RBAC
-- lockdown seed), which left the organizer/participant picker in the
-- Meetings UI (and the pre-existing AdminTicket assignee picker — same
-- /api/users?size=100 call) unusable for the roles who actually schedule
-- meetings day-to-day. view_users is just a name/email directory read, the
-- same low-sensitivity grant MANAGEMENT already has, so extending it to
-- these working roles closes a real usability gap rather than escalating
-- anything meaningfully sensitive.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM', 'DEVOPS')
  AND p.name = 'view_users'
ON CONFLICT (role_id, permission_id) DO NOTHING;
