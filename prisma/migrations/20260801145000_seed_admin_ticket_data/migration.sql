-- Data-only (INSERT ... ON CONFLICT DO NOTHING, no schema changes) seed for
-- the Admin Ticket module's permissions/role-grants and starter categories.
-- Kept as a migration — rather than relying solely on prisma/seed.ts, which
-- does not run automatically on deploy — so this ships with the same
-- `prisma migrate deploy` step that already runs on every production build.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_admin_tickets', 'View admin tickets, categories, and activity', 'ADMIN_TICKET'),
  ('manage_admin_tickets', 'Create/edit/complete admin tickets and categories', 'ADMIN_TICKET')
ON CONFLICT (name) DO NOTHING;

-- ADMIN and DEVOPS (closest existing role to office admin/facilities duties)
-- get full manage access; MANAGEMENT gets read-only view.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name IN ('view_admin_tickets', 'manage_admin_tickets')
  AND r.name IN ('ADMIN', 'DEVOPS')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_admin_tickets'
  AND r.name = 'MANAGEMENT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- updated_at has no DB-level default (Prisma applies @updatedAt only at the
-- client layer), so it must be set explicitly in a raw INSERT.
INSERT INTO admin_ticket_categories (name, code, default_priority, default_sla_days, updated_at)
VALUES
  ('Statutory / Compliance', 'STATUTORY', 'HIGH', 30, CURRENT_TIMESTAMP),
  ('Contracts & Renewals', 'CONTRACTS', 'MEDIUM', 30, CURRENT_TIMESTAMP),
  ('Assets & Facilities', 'ASSETS', 'MEDIUM', 14, CURRENT_TIMESTAMP),
  ('Vendor & Finance', 'VENDOR_FINANCE', 'MEDIUM', 7, CURRENT_TIMESTAMP),
  ('HR / Staff Admin', 'HR_ADMIN', 'MEDIUM', 14, CURRENT_TIMESTAMP),
  ('Ad-hoc', 'AD_HOC', 'LOW', 7, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;
