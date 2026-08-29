import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const types = await prisma.leaveType.findMany();
  console.log('Leave types:', types);
  const perm = await prisma.permission.findUnique({ where: { name: 'approve_leave' }, include: { roles: { include: { role: true } } } });
  console.log('approve_leave granted to:', perm?.roles.map((r) => r.role.name));
  await prisma.$disconnect();
}

main();
