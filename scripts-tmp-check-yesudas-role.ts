import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({
    where: { email: 'yesudas@tekfilo.com' },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user) {
    console.log('No user found with that email');
    return;
  }
  console.log('User:', { id: user.id, email: user.email, isActive: user.isActive });
  console.log('Roles:', user.roles.map((ur) => ur.role.name));
  const perms = user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name));
  console.log('Has manage_email_settings:', perms.includes('manage_email_settings'));
  console.log('All permissions:', perms.sort());
  await prisma.$disconnect();
}
main();
