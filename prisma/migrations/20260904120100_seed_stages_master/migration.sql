-- Data-only (no schema changes) — same convention as
-- 20260831170700_seed_lead_source_and_status_masters.
--
-- Stage: an open picklist like Lead Source/Vertical/Package. View roster
-- mirrors view_lead_sources exactly (every role that can see the Customer
-- module's Stage column or the Implementations module's Stage field);
-- manage mirrors manage_lead_sources' ADMIN/MANAGEMENT-only roster.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_stages', 'View the stage master list', 'STAGES'),
  ('manage_stages', 'Create/edit/deactivate stages', 'STAGES')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_stages'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'BUSINESS_ANALYST', 'DEMO_TEAM', 'SALES')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_stages'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed rows match the hardcoded IMPLEMENTATION_STAGES array this replaces
-- in src/lib/implementationStatus.ts (name is exactly what's already
-- stored in existing Implementation.currentStage rows — see the Stage
-- model's own comment for why code is separate from what gets stored).
INSERT INTO stages (name, code, sort_order, updated_at)
VALUES
  ('Requirements Gathering', 'REQUIREMENTS_GATHERING', 1, CURRENT_TIMESTAMP),
  ('System Configuration', 'SYSTEM_CONFIGURATION', 2, CURRENT_TIMESTAMP),
  ('Data Migration', 'DATA_MIGRATION', 3, CURRENT_TIMESTAMP),
  ('Customization', 'CUSTOMIZATION', 4, CURRENT_TIMESTAMP),
  ('Testing', 'TESTING', 5, CURRENT_TIMESTAMP),
  ('User Training', 'USER_TRAINING', 6, CURRENT_TIMESTAMP),
  ('Go-Live', 'GO_LIVE', 7, CURRENT_TIMESTAMP),
  ('Post Go-Live Support', 'POST_GO_LIVE_SUPPORT', 8, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;
