import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const slabs = await prisma.ptSlab.findMany({ orderBy: { minGross: 'asc' } });
  console.log(slabs);
  await prisma.$disconnect();
}

main();
