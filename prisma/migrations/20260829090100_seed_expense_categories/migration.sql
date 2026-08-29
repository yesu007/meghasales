-- Data-only (no schema changes) — replaces the placeholder category list
-- (Rent, Utilities, Marketing, Travel, Office Supplies, Software &
-- Subscriptions, Professional Fees, Miscellaneous) seeded when Expense was
-- first built, with the company's real category/sub-category list. Old
-- categories are deactivated rather than deleted so any historical expense
-- rows already pointing at them (categoryId is NOT NULL) keep resolving —
-- they just stop showing up in the picker (GET /api/expenses/categories
-- filters isActive: true).
UPDATE expense_categories SET is_active = false
WHERE name IN ('Rent', 'Utilities', 'Marketing', 'Travel', 'Office Supplies', 'Software & Subscriptions', 'Professional Fees', 'Miscellaneous');

INSERT INTO expense_categories (name, sort_order, updated_at)
VALUES
  ('Salary & Wages', 1, CURRENT_TIMESTAMP),
  ('Job Work', 2, CURRENT_TIMESTAMP),
  ('Office & Facilities', 3, CURRENT_TIMESTAMP),
  ('Cloud Infra', 4, CURRENT_TIMESTAMP),
  ('Subscriptions', 5, CURRENT_TIMESTAMP),
  ('Fee', 6, CURRENT_TIMESTAMP),
  ('Utilities & Connectivity', 7, CURRENT_TIMESTAMP),
  ('Travel / Lodging', 8, CURRENT_TIMESTAMP),
  ('CAC', 9, CURRENT_TIMESTAMP),
  ('Annual License', 10, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_sub_categories (category_id, name, sort_order, updated_at)
SELECT c.id, s.name, s.sort_order, CURRENT_TIMESTAMP
FROM expense_categories c
JOIN (VALUES
  ('Salary & Wages', 'Salary', 1),

  ('Job Work', 'Sub Contract', 1),
  ('Job Work', 'Outsource', 2),

  ('Office & Facilities', 'Office Rent', 1),
  ('Office & Facilities', 'Guest House Rent', 2),
  ('Office & Facilities', 'Office Maintenance', 3),
  ('Office & Facilities', 'Staff Welfare', 4),
  ('Office & Facilities', 'Infra Repair', 5),
  ('Office & Facilities', 'Hardware Repair', 6),
  ('Office & Facilities', 'Hardware AMC', 7),

  ('Cloud Infra', 'GitHub', 1),
  ('Cloud Infra', 'AWS - Dev', 2),
  ('Cloud Infra', 'AWS - Production', 3),
  ('Cloud Infra', 'AWS - Unidesign', 4),

  ('Subscriptions', 'Cursor', 1),
  ('Subscriptions', 'Claude', 2),
  ('Subscriptions', 'Astrill', 3),
  ('Subscriptions', 'ChatGPT', 4),
  ('Subscriptions', 'Other Subscriptions', 5),

  ('Fee', 'ESIC / Statutory Provision', 1),
  ('Fee', 'GST Registration and Other Fees', 2),
  ('Fee', 'Audit Fee', 3),

  ('Utilities & Connectivity', 'Electricity', 1),
  ('Utilities & Connectivity', 'WiFi', 2),

  ('Travel / Lodging', 'Travel', 1),
  ('Travel / Lodging', 'Lodging', 2),

  ('CAC', 'Client Acquisition Cost', 1),

  ('Annual License', 'Zoho Books', 1),
  ('Annual License', 'Zoho Mail', 2),
  ('Annual License', 'Tekfilo Website - Domains & Hosting', 3)
) AS s(category_name, name, sort_order) ON s.category_name = c.name
ON CONFLICT (category_id, name) DO NOTHING;
