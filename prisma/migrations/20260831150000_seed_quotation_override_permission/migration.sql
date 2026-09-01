-- Data-only (no schema changes) — same convention as every other module's
-- permission seed. The resource-based Quotation Calculator's "Final amount
-- (override)" input currently only requires manage_quotations — the same
-- grant that lets someone edit an ordinary quotation line item — so any
-- quoter can silently override the system-calculated total with no separate
-- sign-off. authorize_quotation_override is withheld from the authoring
-- roles (SALES) and granted only to ADMIN/MANAGEMENT, same
-- segregation-of-duties reasoning as approve_mom/approve_payroll: the
-- person quoting shouldn't be the one who can unilaterally override the
-- calculated price. Grants below are sane starting defaults, not fixed
-- policy — editable afterward through the Roles & Permissions admin UI.

INSERT INTO permissions (name, description, module)
VALUES
  ('authorize_quotation_override', 'Set or change the manual override amount on a resource-based quotation, superseding the calculated total', 'QUOTATIONS')
ON CONFLICT (name) DO NOTHING;

-- ADMIN — every new permission explicitly, belt-and-suspenders alongside
-- requirePermission()'s implicit ADMIN bypass.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name = 'authorize_quotation_override'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- MANAGEMENT — the authorization authority, not an author.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGEMENT'
  AND p.name = 'authorize_quotation_override'
ON CONFLICT (role_id, permission_id) DO NOTHING;
