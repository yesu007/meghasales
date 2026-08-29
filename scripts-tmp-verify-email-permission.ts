import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const rp = await prisma.rolePermission.findMany({
    where: { permission: { name: 'manage_email_settings' } },
    include: { role: { select: { name: true } }, permission: { select: { name: true, module: true } } },
  });
  console.log(rp.map((r) => ({ role: r.role.name, permission: r.permission.name, module: r.permission.module })));

  const emailConfigCount = await prisma.emailConfig.count();
  console.log('email_config rows:', emailConfigCount);

  await prisma.$disconnect();
}
main();
