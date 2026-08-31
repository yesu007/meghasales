-- Data-only (no schema changes) — same convention as the Verticals/Expense
-- Budget permission seeds. Companies is its own module (a general-purpose
-- customer master, not Sales-pipeline-specific data itself) but sits in the
-- Sales nav section alongside Leads/Quotations, so its viewing roster
-- mirrors view_verticals exactly (every role that touches leads/deals
-- benefits from the shared company/legal-entity picklist); managing the
-- master (creating companies, editing legal entities, uploading documents)
-- is ADMIN/MANAGEMENT only, matching how Verticals/Roles are gated.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_companies', 'View the customer company master and its legal entities', 'SALES'),
  ('manage_companies', 'Create/edit companies, legal entities, and their documents', 'SALES')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_companies'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE', 'BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_companies'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;
