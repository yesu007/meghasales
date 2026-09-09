-- Data-only (no schema changes) — same convention as
-- 20260828120100_seed_expense_budget_permissions /
-- 20260830193200_seed_package_master.
--
-- Lead Source: an open picklist like Vertical/Package — view roster mirrors
-- view_leads exactly (every role that already sees leads/the source
-- dropdown), manage mirrors manage_verticals/manage_packages' ADMIN/
-- MANAGEMENT-only roster. Seed codes match the values already sitting in
-- existing Lead rows (see the LeadSource model comment).
--
-- Lead Status Options: NOT an open picklist — the 6 rows are fixed pipeline
-- stages (see the LeadStatusOption model comment); this only seeds their
-- current label/color/order so the admin screen has something to edit, no
-- create/delete permission distinction is needed since there's no create
-- path in the API either.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_lead_sources', 'View the lead source master list', 'LEAD_SOURCES'),
  ('manage_lead_sources', 'Create/edit/deactivate lead sources', 'LEAD_SOURCES'),
  ('view_lead_status_options', 'View lead status labels/colors', 'LEAD_STATUS_OPTIONS'),
  ('manage_lead_status_options', 'Edit lead status labels/colors/order', 'LEAD_STATUS_OPTIONS')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name IN ('view_lead_sources', 'view_lead_status_options')
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'BUSINESS_ANALYST', 'DEMO_TEAM', 'SALES')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name IN ('manage_lead_sources', 'manage_lead_status_options')
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed rows match the hardcoded SOURCES/CUSTOMER_SOURCES arrays these
-- replace in src/components/leads/LeadFormDrawer.tsx and
-- src/components/customers/CustomerFormDrawer.tsx.
INSERT INTO lead_sources (name, code, sort_order, updated_at)
VALUES
  ('Website', 'WEBSITE', 1, CURRENT_TIMESTAMP),
  ('WhatsApp', 'WHATSAPP', 2, CURRENT_TIMESTAMP),
  ('Referral', 'REFERRAL', 3, CURRENT_TIMESTAMP),
  ('Email', 'EMAIL', 4, CURRENT_TIMESTAMP),
  ('Trade Show', 'TRADE_SHOW', 5, CURRENT_TIMESTAMP),
  ('Cold Call', 'COLD_CALL', 6, CURRENT_TIMESTAMP),
  ('Sales Executive', 'SALES_EXECUTIVE', 7, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

-- Seed rows match the hardcoded LEAD_STATUSES array in src/lib/leadStatus.ts
-- (label/color exactly as they are today — this migration changes nothing
-- about what users see, only where it's stored).
INSERT INTO lead_status_options (code, label, color, sort_order, updated_at)
VALUES
  ('NEW', 'New', 'bg-slate-100 text-slate-700', 1, CURRENT_TIMESTAMP),
  ('CONTACTED', 'Contacted', 'bg-blue-100 text-blue-700', 2, CURRENT_TIMESTAMP),
  ('FOLLOW_UP_SCHEDULED', 'Follow-up Scheduled', 'bg-orange-100 text-orange-700', 3, CURRENT_TIMESTAMP),
  ('QUALIFIED', 'Qualified', 'bg-purple-100 text-purple-700', 4, CURRENT_TIMESTAMP),
  ('CONFIRMED', 'Converted', 'bg-green-100 text-green-700', 5, CURRENT_TIMESTAMP),
  ('DISQUALIFIED', 'Lost / Dropped', 'bg-red-100 text-red-700', 6, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;
