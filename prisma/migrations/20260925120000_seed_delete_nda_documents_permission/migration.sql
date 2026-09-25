-- Data-only (no schema changes) — same convention as every other module's
-- permission seed (e.g. 20260831180000_seed_export_permissions). A distinct
-- permission for deleting NDA / Contract documents on the Customer's
-- Documents → NDA / Contract tab (deleting a contract, or removing its
-- attached document), separate from manage_leads, so it can be granted or
-- withdrawn per role from the Roles & Permissions admin UI. Users get it
-- through their assigned role(s), like every other permission.
--
-- Default roster: ADMIN only (ADMIN also passes every permission check
-- implicitly) — matches who could effectively delete before, since no
-- other role holds manage_leads. Grant it to more roles from the Roles
-- screen as needed.
INSERT INTO permissions (name, description, module)
VALUES ('delete_nda_documents', 'Delete NDA / Contract documents', 'LEADS')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'delete_nda_documents'
  AND r.name IN ('ADMIN')
ON CONFLICT (role_id, permission_id) DO NOTHING;
