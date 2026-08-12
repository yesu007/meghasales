-- Own sequence for employees.employee_code (format "EMP-{seq}"), mirroring
-- admin_ticket_no_seq / invoice_number_seq's approach so concurrent
-- employee onboarding can't collide the way a `count(*) + 1` scheme would.
CREATE SEQUENCE IF NOT EXISTS employee_code_seq;
