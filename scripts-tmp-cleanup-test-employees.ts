import { PrismaClient } from '@prisma/client';
async function main() {
  const prisma = new PrismaClient();
  const r = await prisma.employee.deleteMany({ where: { email: { contains: 'pagination-test-' } } });
  console.log('deleted', r.count);
  await prisma.$disconnect();
}
main();
