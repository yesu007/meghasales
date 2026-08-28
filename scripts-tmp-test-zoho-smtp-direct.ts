import * as dotenv from 'dotenv';
dotenv.config({ path: '/tmp/claude-1000/-home-tekflio-4-yesudas-meghasales-next/1306a47a-65a4-4cdd-b46f-4480ab46b071/scratchpad/prod.env', override: true });
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

async function main() {
  const prisma = new PrismaClient();
  const config = await prisma.emailConfig.findFirstOrThrow({ orderBy: { id: 'asc' } });

  console.log('Testing with:', { host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, user: config.smtpUser, passwordLength: config.smtpPassword?.length });

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser!, pass: config.smtpPassword! },
    logger: true,
    debug: true,
  });

  try {
    const ok = await transporter.verify();
    console.log('VERIFY OK:', ok);
  } catch (e: any) {
    console.log('VERIFY FAILED:', { message: e.message, code: e.code, responseCode: e.responseCode, response: e.response, command: e.command });
  }

  await prisma.$disconnect();
}
main();
