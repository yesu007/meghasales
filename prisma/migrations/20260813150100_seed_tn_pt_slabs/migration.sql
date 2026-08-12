-- Data-only seed of starting Tamil Nadu Professional Tax slabs (no schema
-- changes) — commonly-cited monthly-equivalent figures, NOT verified
-- against a current government notification. Editable via
-- /dashboard/payroll/statutory once payroll is in use; this just means a
-- fresh production database isn't starting with an empty, unusable slab
-- table. No ON CONFLICT guard needed since pt_slabs has no unique
-- constraint to conflict on — this migration is only ever meant to run
-- once, on a database with no existing slabs.
INSERT INTO pt_slabs (state, min_gross, max_gross, monthly_amount, effective_from, is_active, created_at)
SELECT 'TN', v.min_gross, v.max_gross, v.monthly_amount, CURRENT_TIMESTAMP, true, CURRENT_TIMESTAMP
FROM (VALUES
  (0,     21000,  0),
  (21001, 30000,  135),
  (30001, 45000,  315),
  (45001, 60000,  690),
  (60001, 75000,  1025),
  (75001, NULL,   1250)
) AS v(min_gross, max_gross, monthly_amount)
WHERE NOT EXISTS (SELECT 1 FROM pt_slabs WHERE state = 'TN');
