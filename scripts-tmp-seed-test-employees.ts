import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  for (let i = 1; i <= 15; i++) {
    const email = `pagination-test-${i}@example.com`;
    const existing = await prisma.employee.findFirst({ where: { email } });
    if (existing) continue;
    const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('employee_code_seq')`;
    const employeeCode = `EMP-${rows[0].nextval.toString().padStart(6, '0')}`;
    await prisma.employee.create({
      data: { employeeCode, firstName: `Test${i}`, lastName: 'Employee', email },
    });
  }
  console.log('done seeding');
  await prisma.$disconnect();
}
main();
