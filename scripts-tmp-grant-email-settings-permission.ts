import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';

// Targeted grant instead of a full `prisma db seed` re-run — the seed
// script's rest-of-world countries step fires ~190 concurrent upserts via
// Promise.all, which exhausts the Neon pooler's connection pool (13
// connections, 10s timeout) and aborts before reaching this permission.
// Countries/currencies are already seeded in prod; only this permission is
// new, so grant it directly.
async function main() {
  const prisma = new PrismaClient();

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });

  const permission = await prisma.permission.upsert({
    where: { name: 'manage_email_settings' },
    update: {},
    create: { name: 'manage_email_settings', description: 'Configure the outbound SMTP (Zoho Mail) settings used for deadline-reminder emails', module: 'SETTINGS' },
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
    update: {},
    create: { roleId: adminRole.id, permissionId: permission.id },
  });

  console.log('Granted manage_email_settings to ADMIN role', { roleId: adminRole.id, permissionId: permission.id });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
