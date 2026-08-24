-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. approve_mom/publish_mom are deliberately withheld from
-- the authoring roles (BUSINESS_ANALYST/SALES/DEMO_TEAM): the person who
-- writes a MOM shouldn't be its only approver, same segregation-of-duties
-- reasoning the design doc applies to action-item verification. Grants
-- below are sane starting defaults, not fixed policy — editable afterward
-- through the Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('manage_mom', 'Create/edit MOM content and decisions, submit for approval', 'MEETINGS'),
  ('approve_mom', 'Approve or reject a submitted MOM', 'MEETINGS'),
  ('publish_mom', 'Publish an approved MOM to participants', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — every new permission explicitly, belt-and-suspenders alongside
-- requirePermission()'s implicit ADMIN bypass.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN ('manage_mom', 'approve_mom', 'publish_mom')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — the approval authority, not an author.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name IN ('approve_mom', 'publish_mom')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- BUSINESS_ANALYST, SALES, DEMO_TEAM — the people actually in the meetings,
-- writing the MOM and its decisions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
  AND p.name = 'manage_mom'
ON CONFLICT (role_id, permission_id) DO NOTHING;
