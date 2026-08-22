import { PrismaClient } from '@prisma/client';

// One-off: link/create an Employee record for every existing User that
// doesn't have one yet, so users created before the auto-link went live
// (in POST /api/users) also show up in the Employee/Payroll module.
async function main() {
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true } });

  for (const user of users) {
    const existingEmployee = await prisma.employee.findFirst({ where: { email: user.email } });
    if (existingEmployee) {
      if (!existingEmployee.userId) {
        await prisma.employee.update({ where: { id: existingEmployee.id }, data: { userId: user.id } });
        console.log(`Linked existing employee ${existingEmployee.employeeCode} to user ${user.email}`);
      } else {
        console.log(`Employee for ${user.email} already linked, skipping`);
      }
      continue;
    }

    const alreadyLinked = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (alreadyLinked) {
      console.log(`User ${user.email} already has employee ${alreadyLinked.employeeCode}, skipping`);
      continue;
    }

    const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('employee_code_seq')`;
    const employeeCode = `EMP-${rows[0].nextval.toString().padStart(6, '0')}`;
    const employee = await prisma.employee.create({
      data: { userId: user.id, employeeCode, firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
    console.log(`Created employee ${employee.employeeCode} for user ${user.email}`);
  }

  await prisma.$disconnect();
}

main();
