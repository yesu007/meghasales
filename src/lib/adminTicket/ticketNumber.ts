import { Prisma, PrismaClient } from '@prisma/client';

// Own Postgres sequence (admin_ticket_no_seq, see the
// add_admin_ticket_number_sequence migration) — same reasoning as
// invoice_number_seq elsewhere in this app: a `count(*) + 1` scheme races
// under concurrent ticket creation, a sequence can't.
export async function nextAdminTicketNumber(
  client: Prisma.TransactionClient | PrismaClient
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('admin_ticket_no_seq')`;
  const seq = rows[0].nextval;
  return `ADM-${seq.toString().padStart(6, '0')}`;
}
