-- Own sequence for admin_tickets.ticket_no (format "ADM-{seq}"), mirroring
-- invoice_number_seq's approach so concurrent ticket creation can't collide
-- the way a `count(*) + 1` scheme would.
CREATE SEQUENCE IF NOT EXISTS admin_ticket_no_seq;
