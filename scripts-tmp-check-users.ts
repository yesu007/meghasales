import { PrismaClient } from '@prisma/client';
async function main() {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, employee: { select: { id: true } } } });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}
main();
