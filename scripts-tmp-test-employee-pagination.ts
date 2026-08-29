import { PrismaClient } from '@prisma/client';

async function run(page: number, size: number) {
  const prisma = new PrismaClient();
  const where = {};
  const [employees, totalElements] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page * size, take: size }),
    prisma.employee.count({ where }),
  ]);
  console.log({ page, size, returned: employees.length, totalElements, totalPages: Math.ceil(totalElements / size), codes: employees.map(e => e.employeeCode) });
  await prisma.$disconnect();
}

async function main() {
  await run(0, 10);
  await run(1, 10);
  await run(2, 10);
}
main();
