-- Module → Page → View/Create/Edit/Delete permissions.
-- GENERATED from src/lib/permissionCatalog.ts (the same table the Roles
-- screen, sidebar and dashboard route guard read). Every catch-all
-- manage_<page> permission is split into create_/edit_/delete_<page>, and
-- pages that shared a module-wide view_* permission get their own view_<page>.
-- Each new permission is granted to exactly the roles that held the
-- permission(s) it was split from, so no role gains or loses access on
-- deploy; the retired manage_* permissions are then removed. ADMIN is also
-- granted everything explicitly (it already passes every check via the RBAC
-- bypass). Users pick up the change on their next login.

ALTER TABLE "permissions" ADD COLUMN "page" TEXT;
ALTER TABLE "permissions" ADD COLUMN "action" TEXT;
ALTER TABLE "permissions" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- 1. Catalog permissions (existing rows keep their description; module/page/action/order are refreshed).
INSERT INTO "permissions" ("name", "description", "module", "page", "action", "sort_order") VALUES
  ('view_dashboard', 'View the Dashboard home page', 'Dashboard', 'Dashboard', 'view', 0),
  ('view_verticals', 'View verticals', 'Masters', 'Verticals', 'view', 1),
  ('create_verticals', 'Create verticals', 'Masters', 'Verticals', 'create', 2),
  ('edit_verticals', 'Edit verticals', 'Masters', 'Verticals', 'edit', 3),
  ('delete_verticals', 'Delete verticals', 'Masters', 'Verticals', 'delete', 4),
  ('view_projects', 'View projects', 'Masters', 'Projects', 'view', 5),
  ('create_projects', 'Create projects', 'Masters', 'Projects', 'create', 6),
  ('edit_projects', 'Edit projects', 'Masters', 'Projects', 'edit', 7),
  ('delete_projects', 'Delete projects', 'Masters', 'Projects', 'delete', 8),
  ('view_products', 'View products', 'Masters', 'Products', 'view', 9),
  ('create_products', 'Create products', 'Masters', 'Products', 'create', 10),
  ('edit_products', 'Edit products', 'Masters', 'Products', 'edit', 11),
  ('delete_products', 'Delete products', 'Masters', 'Products', 'delete', 12),
  ('view_packages', 'View packages', 'Masters', 'Packages', 'view', 13),
  ('create_packages', 'Create packages', 'Masters', 'Packages', 'create', 14),
  ('edit_packages', 'Edit packages', 'Masters', 'Packages', 'edit', 15),
  ('delete_packages', 'Delete packages', 'Masters', 'Packages', 'delete', 16),
  ('view_lead_sources', 'View lead sources', 'Masters', 'Lead Sources', 'view', 17),
  ('create_lead_sources', 'Create lead sources', 'Masters', 'Lead Sources', 'create', 18),
  ('edit_lead_sources', 'Edit lead sources', 'Masters', 'Lead Sources', 'edit', 19),
  ('delete_lead_sources', 'Delete lead sources', 'Masters', 'Lead Sources', 'delete', 20),
  ('view_lead_status_options', 'View lead statuses', 'Masters', 'Lead Statuses', 'view', 21),
  ('create_lead_status_options', 'Create lead statuses', 'Masters', 'Lead Statuses', 'create', 22),
  ('edit_lead_status_options', 'Edit lead statuses', 'Masters', 'Lead Statuses', 'edit', 23),
  ('view_stages', 'View stages', 'Masters', 'Stages', 'view', 24),
  ('create_stages', 'Create stages', 'Masters', 'Stages', 'create', 25),
  ('edit_stages', 'Edit stages', 'Masters', 'Stages', 'edit', 26),
  ('delete_stages', 'Delete stages', 'Masters', 'Stages', 'delete', 27),
  ('view_leads', 'View leads', 'Sales', 'Leads', 'view', 28),
  ('create_leads', 'Create leads', 'Sales', 'Leads', 'create', 29),
  ('edit_leads', 'Edit leads', 'Sales', 'Leads', 'edit', 30),
  ('delete_leads', 'Delete leads', 'Sales', 'Leads', 'delete', 31),
  ('delete_nda_documents', 'Delete NDA documents on a lead', 'Sales', 'Leads', 'other', 32),
  ('view_lead_events', 'View lead events & documents', 'Sales', 'Lead Events & Documents', 'view', 33),
  ('create_lead_events', 'Create lead events & documents', 'Sales', 'Lead Events & Documents', 'create', 34),
  ('edit_lead_events', 'Edit lead events & documents', 'Sales', 'Lead Events & Documents', 'edit', 35),
  ('delete_lead_events', 'Delete lead events & documents', 'Sales', 'Lead Events & Documents', 'delete', 36),
  ('add_lead_discussion', 'Add discussions to lead events', 'Sales', 'Lead Events & Documents', 'other', 37),
  ('view_customers', 'View customers', 'Sales', 'Customers', 'view', 38),
  ('create_customers', 'Create customers', 'Sales', 'Customers', 'create', 39),
  ('edit_customers', 'Edit customers', 'Sales', 'Customers', 'edit', 40),
  ('delete_customers', 'Delete customers', 'Sales', 'Customers', 'delete', 41),
  ('view_companies', 'View companies', 'Sales', 'Companies', 'view', 42),
  ('create_companies', 'Create companies', 'Sales', 'Companies', 'create', 43),
  ('edit_companies', 'Edit companies', 'Sales', 'Companies', 'edit', 44),
  ('delete_companies', 'Delete companies', 'Sales', 'Companies', 'delete', 45),
  ('view_quotations', 'View quotations', 'Sales', 'Quotations', 'view', 46),
  ('create_quotations', 'Create quotations', 'Sales', 'Quotations', 'create', 47),
  ('edit_quotations', 'Edit quotations', 'Sales', 'Quotations', 'edit', 48),
  ('delete_quotations', 'Delete quotations', 'Sales', 'Quotations', 'delete', 49),
  ('export_quotations', 'Export quotations', 'Sales', 'Quotations', 'other', 50),
  ('authorize_quotation_override', 'Authorize quotation price overrides', 'Sales', 'Quotations', 'other', 51),
  ('view_demos', 'View demos', 'Sales', 'Demos', 'view', 52),
  ('create_demos', 'Create demos', 'Sales', 'Demos', 'create', 53),
  ('edit_demos', 'Edit demos', 'Sales', 'Demos', 'edit', 54),
  ('delete_demos', 'Delete demos', 'Sales', 'Demos', 'delete', 55),
  ('view_implementations', 'View implementations', 'Sales', 'Implementations', 'view', 56),
  ('create_implementations', 'Create implementations', 'Sales', 'Implementations', 'create', 57),
  ('edit_implementations', 'Edit implementations', 'Sales', 'Implementations', 'edit', 58),
  ('delete_implementations', 'Delete implementations', 'Sales', 'Implementations', 'delete', 59),
  ('view_meetings', 'View to do (meetings)', 'Meetings', 'To Do (Meetings)', 'view', 60),
  ('create_meetings', 'Create to do (meetings)', 'Meetings', 'To Do (Meetings)', 'create', 61),
  ('edit_meetings', 'Edit to do (meetings)', 'Meetings', 'To Do (Meetings)', 'edit', 62),
  ('create_mom', 'Create minutes of meeting', 'Meetings', 'Minutes of Meeting', 'create', 63),
  ('edit_mom', 'Edit minutes of meeting', 'Meetings', 'Minutes of Meeting', 'edit', 64),
  ('approve_mom', 'Approve minutes of meeting', 'Meetings', 'Minutes of Meeting', 'other', 65),
  ('publish_mom', 'Publish minutes of meeting', 'Meetings', 'Minutes of Meeting', 'other', 66),
  ('view_action_items', 'View action items', 'Meetings', 'Action Items', 'view', 67),
  ('assign_action_items', 'Create and assign action items', 'Meetings', 'Action Items', 'other', 68),
  ('manage_own_action_items', 'Update own action items', 'Meetings', 'Action Items', 'other', 69),
  ('close_action_items', 'Close action items', 'Meetings', 'Action Items', 'other', 70),
  ('verify_action_items', 'Verify action items', 'Meetings', 'Action Items', 'other', 71),
  ('reopen_action_items', 'Reopen action items', 'Meetings', 'Action Items', 'other', 72),
  ('view_meetings_dashboard', 'View the meetings dashboard', 'Meetings', 'Meetings Dashboard', 'view', 73),
  ('view_meeting_team_dashboard', 'View the team-wide meetings dashboard', 'Meetings', 'Meetings Dashboard', 'other', 74),
  ('view_meeting_reports', 'View meeting reports', 'Meetings', 'Meeting Reports', 'view', 75),
  ('export_meeting_reports', 'Export meeting reports', 'Meetings', 'Meeting Reports', 'other', 76),
  ('view_accounting', 'View the accounting dashboard', 'Finance', 'Accounting Dashboard', 'view', 77),
  ('view_invoices', 'View invoices and credit notes', 'Finance', 'Invoices', 'view', 78),
  ('create_invoices', 'Create invoices', 'Finance', 'Invoices', 'create', 79),
  ('edit_invoices', 'Edit invoices', 'Finance', 'Invoices', 'edit', 80),
  ('delete_invoices', 'Delete invoices', 'Finance', 'Invoices', 'delete', 81),
  ('create_payments', 'Create payments', 'Finance', 'Payments', 'create', 82),
  ('edit_payments', 'Edit payments', 'Finance', 'Payments', 'edit', 83),
  ('delete_payments', 'Delete payments', 'Finance', 'Payments', 'delete', 84),
  ('view_payment_reminders', 'View payment reminders', 'Finance', 'Payment Reminders', 'view', 85),
  ('create_payment_reminders', 'Create payment reminders', 'Finance', 'Payment Reminders', 'create', 86),
  ('edit_payment_reminders', 'Edit payment reminders', 'Finance', 'Payment Reminders', 'edit', 87),
  ('delete_payment_reminders', 'Delete payment reminders', 'Finance', 'Payment Reminders', 'delete', 88),
  ('view_customer_ledger', 'View the customer ledger', 'Finance', 'Customer Ledger', 'view', 89),
  ('view_accounting_reports', 'View accounting reports', 'Finance', 'Accounting Reports', 'view', 90),
  ('export_accounting', 'Export accounting data', 'Finance', 'Accounting Reports', 'other', 91),
  ('view_bills', 'View bills and suppliers', 'Finance', 'Bills', 'view', 92),
  ('create_bills', 'Create bills', 'Finance', 'Bills', 'create', 93),
  ('edit_bills', 'Edit bills', 'Finance', 'Bills', 'edit', 94),
  ('delete_bills', 'Delete bills', 'Finance', 'Bills', 'delete', 95),
  ('view_expenses', 'View expenses', 'Finance', 'Expenses', 'view', 96),
  ('create_expenses', 'Create expenses', 'Finance', 'Expenses', 'create', 97),
  ('edit_expenses', 'Edit expenses', 'Finance', 'Expenses', 'edit', 98),
  ('delete_expenses', 'Delete expenses', 'Finance', 'Expenses', 'delete', 99),
  ('view_expense_budgets', 'View expense budgets', 'Finance', 'Expense Budgets', 'view', 100),
  ('create_expense_budgets', 'Create expense budgets', 'Finance', 'Expense Budgets', 'create', 101),
  ('edit_expense_budgets', 'Edit expense budgets', 'Finance', 'Expense Budgets', 'edit', 102),
  ('delete_expense_budgets', 'Delete expense budgets', 'Finance', 'Expense Budgets', 'delete', 103),
  ('approve_expense_claims', 'Review, approve, reject and pay employee expense claims', 'Finance', 'Reimbursement Approvals', 'other', 104),
  ('view_employees', 'View employees', 'Payroll', 'Employees', 'view', 105),
  ('create_employees', 'Create employees', 'Payroll', 'Employees', 'create', 106),
  ('edit_employees', 'Edit employees', 'Payroll', 'Employees', 'edit', 107),
  ('delete_employees', 'Delete employees', 'Payroll', 'Employees', 'delete', 108),
  ('view_salary_structures', 'View salary structures', 'Payroll', 'Salary Structures', 'view', 109),
  ('create_salary_structures', 'Create salary structures', 'Payroll', 'Salary Structures', 'create', 110),
  ('edit_salary_structures', 'Edit salary structures', 'Payroll', 'Salary Structures', 'edit', 111),
  ('view_payroll', 'View payroll runs and payslips', 'Payroll', 'Payroll Runs', 'view', 112),
  ('run_payroll', 'Create, regenerate and edit payroll runs', 'Payroll', 'Payroll Runs', 'other', 113),
  ('approve_payroll', 'Approve payroll runs', 'Payroll', 'Payroll Runs', 'other', 114),
  ('view_timesheet', 'View time & attendance, leave requests and holidays', 'Payroll', 'Time & Attendance', 'view', 115),
  ('create_timesheet', 'Create time & attendance', 'Payroll', 'Time & Attendance', 'create', 116),
  ('edit_timesheet', 'Edit time & attendance', 'Payroll', 'Time & Attendance', 'edit', 117),
  ('delete_timesheet', 'Delete time & attendance', 'Payroll', 'Time & Attendance', 'delete', 118),
  ('approve_leave', 'Approve or reject leave requests', 'Payroll', 'Time & Attendance', 'other', 119),
  ('view_shifts', 'View shifts', 'Payroll', 'Shift Master', 'view', 120),
  ('create_shifts', 'Create shift master', 'Payroll', 'Shift Master', 'create', 121),
  ('edit_shifts', 'Edit shift master', 'Payroll', 'Shift Master', 'edit', 122),
  ('delete_shifts', 'Delete shift master', 'Payroll', 'Shift Master', 'delete', 123),
  ('view_loans', 'View loans & advances', 'Payroll', 'Loans & Advances', 'view', 124),
  ('create_loans', 'Create loans & advances', 'Payroll', 'Loans & Advances', 'create', 125),
  ('edit_loans', 'Edit loans & advances', 'Payroll', 'Loans & Advances', 'edit', 126),
  ('view_salary_allocation', 'View salary allocation', 'Payroll', 'Salary Allocation', 'view', 127),
  ('edit_salary_allocation', 'Edit salary allocation', 'Payroll', 'Salary Allocation', 'edit', 128),
  ('view_payroll_reports', 'View payroll reports', 'Payroll', 'Payroll Reports', 'view', 129),
  ('export_payroll', 'Export payroll data', 'Payroll', 'Payroll Reports', 'other', 130),
  ('view_statutory_settings', 'View statutory settings', 'Payroll', 'Statutory Settings', 'view', 131),
  ('create_statutory_settings', 'Create statutory settings', 'Payroll', 'Statutory Settings', 'create', 132),
  ('edit_statutory_settings', 'Edit statutory settings', 'Payroll', 'Statutory Settings', 'edit', 133),
  ('view_reports', 'View the reports hub', 'Reports', 'Reports', 'view', 134),
  ('my_space', 'My Space access', 'My Space', 'My Space', 'other', 135),
  ('my_leave', 'My Leave', 'My Space', 'My Space', 'other', 136),
  ('my_payslips', 'My Payslips', 'My Space', 'My Space', 'other', 137),
  ('view_admin_tickets', 'View admin tickets', 'Administration', 'Admin Tickets', 'view', 138),
  ('create_admin_tickets', 'Create admin tickets', 'Administration', 'Admin Tickets', 'create', 139),
  ('edit_admin_tickets', 'Edit admin tickets', 'Administration', 'Admin Tickets', 'edit', 140),
  ('view_users', 'View users', 'Administration', 'Users', 'view', 141),
  ('create_users', 'Create users', 'Administration', 'Users', 'create', 142),
  ('edit_users', 'Edit users', 'Administration', 'Users', 'edit', 143),
  ('delete_users', 'Delete users', 'Administration', 'Users', 'delete', 144),
  ('view_roles', 'View roles & permissions', 'Administration', 'Roles & Permissions', 'view', 145),
  ('create_roles', 'Create roles & permissions', 'Administration', 'Roles & Permissions', 'create', 146),
  ('edit_roles', 'Edit roles & permissions', 'Administration', 'Roles & Permissions', 'edit', 147),
  ('delete_roles', 'Delete roles & permissions', 'Administration', 'Roles & Permissions', 'delete', 148),
  ('view_audit_logs', 'View the audit report', 'Administration', 'Audit Report', 'view', 149),
  ('export_audit_logs', 'Export the audit report', 'Administration', 'Audit Report', 'other', 150),
  ('edit_settings', 'Edit company profile settings', 'Settings', 'Company Settings', 'edit', 151),
  ('create_countries', 'Create countries', 'Settings', 'Countries', 'create', 152),
  ('edit_countries', 'Edit countries', 'Settings', 'Countries', 'edit', 153),
  ('delete_countries', 'Delete countries', 'Settings', 'Countries', 'delete', 154),
  ('view_email_settings', 'View outbound email (SMTP) settings', 'Settings', 'Email Settings', 'view', 155),
  ('edit_email_settings', 'Edit email settings', 'Settings', 'Email Settings', 'edit', 156),
  ('view_notification_templates', 'View notification templates', 'Settings', 'Notification Templates', 'view', 157),
  ('edit_notification_templates', 'Edit notification templates', 'Settings', 'Notification Templates', 'edit', 158)
ON CONFLICT ("name") DO UPDATE SET "module" = EXCLUDED."module", "page" = EXCLUDED."page", "action" = EXCLUDED."action", "sort_order" = EXCLUDED."sort_order";

-- 2. Grant each new permission to the roles that held what it replaces.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_verticals')
CROSS JOIN "permissions" np WHERE np."name" = 'create_verticals'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_verticals')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_verticals'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_verticals')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_verticals'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_projects')
CROSS JOIN "permissions" np WHERE np."name" = 'create_projects'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_projects')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_projects'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_projects')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_projects'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_products')
CROSS JOIN "permissions" np WHERE np."name" = 'create_products'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_products')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_products'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_products')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_products'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_packages')
CROSS JOIN "permissions" np WHERE np."name" = 'create_packages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_packages')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_packages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_packages')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_packages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_sources')
CROSS JOIN "permissions" np WHERE np."name" = 'create_lead_sources'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_sources')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_lead_sources'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_sources')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_lead_sources'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_status_options')
CROSS JOIN "permissions" np WHERE np."name" = 'create_lead_status_options'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_status_options')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_lead_status_options'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_stages')
CROSS JOIN "permissions" np WHERE np."name" = 'create_stages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_stages')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_stages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_stages')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_stages'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'create_leads'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_leads'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_leads'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_events')
CROSS JOIN "permissions" np WHERE np."name" = 'create_lead_events'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_events')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_lead_events'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_lead_events')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_lead_events'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'view_customers'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'create_customers'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_customers'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_leads')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_customers'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_companies')
CROSS JOIN "permissions" np WHERE np."name" = 'create_companies'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_companies')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_companies'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_companies')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_companies'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_quotations')
CROSS JOIN "permissions" np WHERE np."name" = 'create_quotations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_quotations')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_quotations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_quotations')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_quotations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_demos')
CROSS JOIN "permissions" np WHERE np."name" = 'create_demos'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_demos')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_demos'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_demos')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_demos'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_implementations')
CROSS JOIN "permissions" np WHERE np."name" = 'create_implementations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_implementations')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_implementations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_implementations')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_implementations'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_meetings')
CROSS JOIN "permissions" np WHERE np."name" = 'create_meetings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_meetings')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_meetings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_mom')
CROSS JOIN "permissions" np WHERE np."name" = 'create_mom'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_mom')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_mom'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_meetings')
CROSS JOIN "permissions" np WHERE np."name" = 'view_action_items'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_meetings')
CROSS JOIN "permissions" np WHERE np."name" = 'view_meetings_dashboard'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_accounting')
CROSS JOIN "permissions" np WHERE np."name" = 'view_invoices'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices')
CROSS JOIN "permissions" np WHERE np."name" = 'create_invoices'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_invoices'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_invoices'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'create_payments'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_payments'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_payments'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_accounting')
CROSS JOIN "permissions" np WHERE np."name" = 'view_payment_reminders'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices', 'manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'create_payment_reminders'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices', 'manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_payment_reminders'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_invoices', 'manage_payments')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_payment_reminders'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_accounting')
CROSS JOIN "permissions" np WHERE np."name" = 'view_customer_ledger'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_accounting')
CROSS JOIN "permissions" np WHERE np."name" = 'view_accounting_reports'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'view_bills'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'create_bills'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_bills'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_bills'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'create_expenses'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_expenses'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expenses')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_expenses'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expense_budgets')
CROSS JOIN "permissions" np WHERE np."name" = 'create_expense_budgets'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expense_budgets')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_expense_budgets'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_expense_budgets')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_expense_budgets'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_employees'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'create_employees'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_employees'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_employees'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_salary_structures'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'create_salary_structures'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_salary_structures'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_timesheet'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees', 'manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'create_timesheet'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees', 'manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_timesheet'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees', 'manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_timesheet'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_shifts'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'create_shifts'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_shifts'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_shifts'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_loans'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'create_loans'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_loans'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_salary_allocation'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_employees')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_salary_allocation'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_payroll_reports'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('view_payroll')
CROSS JOIN "permissions" np WHERE np."name" = 'view_statutory_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'create_statutory_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_salary_structures')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_statutory_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_admin_tickets')
CROSS JOIN "permissions" np WHERE np."name" = 'create_admin_tickets'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_admin_tickets')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_admin_tickets'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_users')
CROSS JOIN "permissions" np WHERE np."name" = 'create_users'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_users')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_users'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_users')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_users'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_roles')
CROSS JOIN "permissions" np WHERE np."name" = 'create_roles'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_roles')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_roles'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_roles')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_roles'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_countries')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_countries')
CROSS JOIN "permissions" np WHERE np."name" = 'create_countries'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_countries')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_countries'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_countries')
CROSS JOIN "permissions" np WHERE np."name" = 'delete_countries'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_email_settings')
CROSS JOIN "permissions" np WHERE np."name" = 'view_email_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_email_settings')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_email_settings'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_notification_templates')
CROSS JOIN "permissions" np WHERE np."name" = 'view_notification_templates'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('manage_notification_templates')
CROSS JOIN "permissions" np WHERE np."name" = 'edit_notification_templates'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. ADMIN gets every catalog permission explicitly.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'ADMIN' AND p."name" IN ('view_dashboard', 'view_verticals', 'create_verticals', 'edit_verticals', 'delete_verticals', 'view_projects', 'create_projects', 'edit_projects', 'delete_projects', 'view_products', 'create_products', 'edit_products', 'delete_products', 'view_packages', 'create_packages', 'edit_packages', 'delete_packages', 'view_lead_sources', 'create_lead_sources', 'edit_lead_sources', 'delete_lead_sources', 'view_lead_status_options', 'create_lead_status_options', 'edit_lead_status_options', 'view_stages', 'create_stages', 'edit_stages', 'delete_stages', 'view_leads', 'create_leads', 'edit_leads', 'delete_leads', 'delete_nda_documents', 'view_lead_events', 'create_lead_events', 'edit_lead_events', 'delete_lead_events', 'add_lead_discussion', 'view_customers', 'create_customers', 'edit_customers', 'delete_customers', 'view_companies', 'create_companies', 'edit_companies', 'delete_companies', 'view_quotations', 'create_quotations', 'edit_quotations', 'delete_quotations', 'export_quotations', 'authorize_quotation_override', 'view_demos', 'create_demos', 'edit_demos', 'delete_demos', 'view_implementations', 'create_implementations', 'edit_implementations', 'delete_implementations', 'view_meetings', 'create_meetings', 'edit_meetings', 'create_mom', 'edit_mom', 'approve_mom', 'publish_mom', 'view_action_items', 'assign_action_items', 'manage_own_action_items', 'close_action_items', 'verify_action_items', 'reopen_action_items', 'view_meetings_dashboard', 'view_meeting_team_dashboard', 'view_meeting_reports', 'export_meeting_reports', 'view_accounting', 'view_invoices', 'create_invoices', 'edit_invoices', 'delete_invoices', 'create_payments', 'edit_payments', 'delete_payments', 'view_payment_reminders', 'create_payment_reminders', 'edit_payment_reminders', 'delete_payment_reminders', 'view_customer_ledger', 'view_accounting_reports', 'export_accounting', 'view_bills', 'create_bills', 'edit_bills', 'delete_bills', 'view_expenses', 'create_expenses', 'edit_expenses', 'delete_expenses', 'view_expense_budgets', 'create_expense_budgets', 'edit_expense_budgets', 'delete_expense_budgets', 'approve_expense_claims', 'view_employees', 'create_employees', 'edit_employees', 'delete_employees', 'view_salary_structures', 'create_salary_structures', 'edit_salary_structures', 'view_payroll', 'run_payroll', 'approve_payroll', 'view_timesheet', 'create_timesheet', 'edit_timesheet', 'delete_timesheet', 'approve_leave', 'view_shifts', 'create_shifts', 'edit_shifts', 'delete_shifts', 'view_loans', 'create_loans', 'edit_loans', 'view_salary_allocation', 'edit_salary_allocation', 'view_payroll_reports', 'export_payroll', 'view_statutory_settings', 'create_statutory_settings', 'edit_statutory_settings', 'view_reports', 'my_space', 'my_leave', 'my_payslips', 'view_admin_tickets', 'create_admin_tickets', 'edit_admin_tickets', 'view_users', 'create_users', 'edit_users', 'delete_users', 'view_roles', 'create_roles', 'edit_roles', 'delete_roles', 'view_audit_logs', 'export_audit_logs', 'edit_settings', 'create_countries', 'edit_countries', 'delete_countries', 'view_email_settings', 'edit_email_settings', 'view_notification_templates', 'edit_notification_templates')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 4. Remove the retired catch-all permissions (role_permissions has no cascade).
DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "name" IN ('manage_verticals', 'manage_projects', 'manage_products', 'manage_packages', 'manage_lead_sources', 'manage_lead_status_options', 'manage_stages', 'manage_leads', 'manage_lead_events', 'manage_companies', 'manage_quotations', 'manage_demos', 'manage_implementations', 'manage_meetings', 'manage_mom', 'manage_invoices', 'manage_payments', 'manage_expenses', 'manage_expense_budgets', 'manage_employees', 'manage_salary_structures', 'manage_admin_tickets', 'manage_users', 'manage_roles', 'manage_countries', 'manage_email_settings', 'manage_notification_templates'));
DELETE FROM "permissions" WHERE "name" IN ('manage_verticals', 'manage_projects', 'manage_products', 'manage_packages', 'manage_lead_sources', 'manage_lead_status_options', 'manage_stages', 'manage_leads', 'manage_lead_events', 'manage_companies', 'manage_quotations', 'manage_demos', 'manage_implementations', 'manage_meetings', 'manage_mom', 'manage_invoices', 'manage_payments', 'manage_expenses', 'manage_expense_budgets', 'manage_employees', 'manage_salary_structures', 'manage_admin_tickets', 'manage_users', 'manage_roles', 'manage_countries', 'manage_email_settings', 'manage_notification_templates');

