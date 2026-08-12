import { Prisma, PrismaClient } from '@prisma/client';

// Own Postgres sequence (employee_code_seq, see the
// add_employee_code_sequence migration) — same reasoning as
// admin_ticket_no_seq / invoice_number_seq: a `count(*) + 1` scheme races
// under concurrent employee onboarding, a sequence can't.
export async function nextEmployeeCode(client: Prisma.TransactionClient | PrismaClient): Promise<string> {
  const rows = await client.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('employee_code_seq')`;
  const seq = rows[0].nextval;
  return `EMP-${seq.toString().padStart(6, '0')}`;
}
