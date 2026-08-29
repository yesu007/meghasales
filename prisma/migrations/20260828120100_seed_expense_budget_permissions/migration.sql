-- Data-only (no schema changes) — same convention as the Expense/Payroll
-- permission seeds. Verticals is its own module (a general-purpose master,
-- not accounting-specific — Lead/Implementation/Employee will consume it
-- later); Expense Budget is grouped under 'ACCOUNTING' since it sits
-- alongside Expenses/Invoices/Payments as the same money-management area.
--
-- Vertical viewing is broad (every role that touches leads/projects/deals
-- benefits from a shared picklist) but managing the master list is
-- ADMIN/MANAGEMENT only, matching how Roles & other masters are gated.
-- Expense Budget view/manage mirrors view_expenses/manage_expenses exactly
-- — same ADMIN/MANAGEMENT/FINANCE roster, no separate approval permission
-- for the same reason Expense doesn't have one (mark-PAID and edit already
-- share manage_expenses; DRAFT->APPROVED on a budget is the same shape).
INSERT INTO permissions (name, description, module)
VALUES
  ('view_verticals', 'View the business vertical master list', 'VERTICALS'),
  ('manage_verticals', 'Create/edit/deactivate business verticals', 'VERTICALS'),
  ('view_expense_budgets', 'View expense budgets and Budget vs Actual variance', 'ACCOUNTING'),
  ('manage_expense_budgets', 'Create/edit/approve/revise expense budgets', 'ACCOUNTING')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_verticals'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE', 'BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_verticals'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name IN ('view_expense_budgets', 'manage_expense_budgets')
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed the six verticals named in the BRD (§10 Vertical Master) so the
-- budget form has real options from day one instead of an empty picklist.
INSERT INTO verticals (name, code, sort_order)
VALUES
  ('Jewellery Manufacturing', 'JEWELLERY_MFG', 1),
  ('Trading', 'TRADING', 2),
  ('Retail', 'RETAIL', 3),
  ('Diamond', 'DIAMOND', 4),
  ('Gemstone', 'GEMSTONE', 5),
  ('Other', 'OTHER', 6)
ON CONFLICT (name) DO NOTHING;
