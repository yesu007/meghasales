import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const perms = await prisma.permission.findMany({ where: { module: 'PAYROLL' }, include: { roles: { include: { role: true } } } });
  for (const p of perms) {
    console.log(p.name, '->', p.roles.map((rp) => rp.role.name).join(', '));
  }
  const emp = await prisma.employee.count();
  console.log('employees table row count:', emp);
  const cp = await prisma.companyProfile.findFirst({ select: { tanNumber: true, pfEstablishmentCode: true, esiEstablishmentCode: true, ptRegistrationNumber: true } });
  console.log('company profile statutory fields:', cp);
  await prisma.$disconnect();
}

main();
