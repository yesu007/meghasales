-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. verify_action_items/close_action_items are deliberately
-- withheld from the authoring/assigning roles: the person who assigns (or
-- completes) an item shouldn't be its own verifier, same
-- segregation-of-duties reasoning already applied to MOM approval.
-- manage_own_action_items is the baseline every role needs (act on an item
-- assigned to *them*) — ownership is enforced in the service layer per
-- item, this permission just gates "logged in at all", so it goes to every
-- current role rather than a subset. Grants below are sane starting
-- defaults, not fixed policy — editable afterward through the Roles &
-- Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('assign_action_items', 'Create action items and assign/reassign their owner', 'MEETINGS'),
  ('manage_own_action_items', 'Accept, progress, and complete action items assigned to you', 'MEETINGS'),
  ('verify_action_items', 'Verify a completed action item, or reject it back for rework', 'MEETINGS'),
  ('close_action_items', 'Close a verified action item', 'MEETINGS'),
  ('reopen_action_items', 'Reopen a closed or cancelled action item', 'MEETINGS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — every new permission explicitly, belt-and-suspenders alongside
-- requirePermission()'s implicit ADMIN bypass.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN ('assign_action_items', 'manage_own_action_items', 'verify_action_items', 'close_action_items', 'reopen_action_items')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — the assign/verify/close/reopen authority, same oversight
-- role it already has for MOM approval/publish.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name IN ('assign_action_items', 'manage_own_action_items', 'verify_action_items', 'close_action_items', 'reopen_action_items')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- BUSINESS_ANALYST, SALES, DEMO_TEAM — the same roles that already write
-- MOMs get to turn decisions into assigned action items.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
  AND p.name IN ('assign_action_items', 'manage_own_action_items')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- DEVOPS, FINANCE — no MOM-authoring role, but they can still be assigned
-- an action item out of a meeting and need the baseline to act on it.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('DEVOPS', 'FINANCE')
  AND p.name = 'manage_own_action_items'
ON CONFLICT (role_id, permission_id) DO NOTHING;
