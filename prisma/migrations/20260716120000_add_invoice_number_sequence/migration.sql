-- Invoice numbers were generated as `INV-${count(*) + 1}`, which races under
-- concurrent creation (e.g. two quotations approved close together both read
-- the same count and collide on the invoice_number unique constraint,
-- rolling back the whole approval transaction). A sequence increments
-- atomically regardless of concurrent transactions, so it can't collide.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

DO $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '(\d+)$'))[1]::int), 0)
    INTO max_num
    FROM invoices;
  PERFORM setval('invoice_number_seq', max_num + 1, false);
END $$;
