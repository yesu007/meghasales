process.env.NEXT_PUBLIC_FEATURE_PAYROLL = 'true';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Exercises the same create-user + auto-link-employee transaction added to
// POST /api/users, without going through the HTTP/auth layer.
async function main() {
  const prisma = new PrismaClient();
  const email = 'tmp-test-user@tekfilo.com';

  await prisma.user.deleteMany({ where: { email } });

  const hashedPassword = await bcrypt.hash('Passw0rd!', 10);

  const { user, linkedEmployee } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, firstName: 'Tmp', lastName: 'Test', password: hashedPassword, isActive: true },
    });

    let linkedEmployee = false;
    const existingEmployee = await tx.employee.findFirst({ where: { email } });
    if (existingEmployee) {
      if (!existingEmployee.userId) {
        await tx.employee.update({ where: { id: existingEmployee.id }, data: { userId: user.id } });
        linkedEmployee = true;
      }
    } else {
      const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('employee_code_seq')`;
      const employeeCode = `EMP-${rows[0].nextval.toString().padStart(6, '0')}`;
      await tx.employee.create({
        data: { userId: user.id, employeeCode, firstName: user.firstName, lastName: user.lastName, email },
      });
      linkedEmployee = true;
    }

    return { user, linkedEmployee };
  });

  const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
  console.log({ userId: user.id, linkedEmployee, employee });

  // cleanup
  await prisma.employee.delete({ where: { id: employee!.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log('cleaned up test user/employee');

  await prisma.$disconnect();
}

main();
