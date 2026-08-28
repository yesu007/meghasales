import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const config = await prisma.emailConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!config) {
    console.log('No email_config row exists yet');
    return;
  }
  const { smtpPassword, ...rest } = config;
  console.log({ ...rest, smtpPasswordLength: smtpPassword?.length ?? 0 });
  await prisma.$disconnect();
}
main();
