import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true, userId: true } });
  console.log(employees);
  await prisma.$disconnect();
}

main();
