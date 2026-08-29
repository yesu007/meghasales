-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. Phase 5 (dashboards & reporting) needs two new gates: a
-- department-scoped "team/manager" tier and an org-wide reporting/export
-- tier. No MANAGER role exists in this schema, and no manager/reports-to
-- relationship exists anywhere to assign one against (see the Meeting
-- Lifecycle Blueprint §07/§09/§12 assumptions), so both are plain
-- permissions rather than new Role rows — same convention every other
-- visibility gate in this codebase already uses. Grants below are sane
-- starting defaults, not fixed policy — editable afterward through the
-- Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('view_meeting_team_dashboard', 'View the department-scoped team dashboard (workload, SLA breach trend, completion rate) for one''s own Employee.department', 'MEETINGS'),
  ('view_meeting_reports', 'View the org-wide management dashboard and run/export filtered action-item reports', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — belt-and-suspenders alongside requirePermission()'s implicit
-- ADMIN bypass, same as every other module's seed migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN ('view_meeting_team_dashboard', 'view_meeting_reports')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — the same oversight role that already approves/publishes
-- MOMs and edits notification templates.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name IN ('view_meeting_team_dashboard', 'view_meeting_reports')
ON CONFLICT (role_id, permission_id) DO NOTHING;
