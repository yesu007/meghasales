import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const totalUsers = await prisma.user.count();
  const usersWithoutEmployee = await prisma.user.count({ where: { employee: null } });
  const totalEmployees = await prisma.employee.count();
  console.log({ totalUsers, usersWithoutEmployee, totalEmployees });
  await prisma.$disconnect();
}
main();
