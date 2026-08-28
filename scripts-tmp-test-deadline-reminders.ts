import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

async function main() {
  const prisma = new PrismaClient();

  // Ethereal test SMTP account — a real inbox-less SMTP server nodemailer
  // can talk to, so we exercise the actual transport code path without a
  // real Zoho account. If this environment has no network egress to
  // ethereal.email, this step is skipped and the notification-only path is
  // still tested.
  let etherealAccount: Awaited<ReturnType<typeof nodemailer.createTestAccount>> | null = null;
  try {
    etherealAccount = await nodemailer.createTestAccount();
  } catch (e) {
    console.log('Could not create Ethereal test account (no network?), skipping email-path test:', (e as Error).message);
  }

  if (etherealAccount) {
    await prisma.emailConfig.deleteMany({});
    await prisma.emailConfig.create({
      data: {
        smtpHost: etherealAccount.smtp.host,
        smtpPort: etherealAccount.smtp.port,
        smtpSecure: etherealAccount.smtp.secure,
        smtpUser: etherealAccount.user,
        smtpPassword: etherealAccount.pass,
        fromEmail: etherealAccount.user,
        fromName: 'MeghaSales Test',
        isActive: true,
      },
    });
    console.log('Configured Ethereal test SMTP account:', etherealAccount.user);
  }

  // Set up a lead whose follow-up is 2 hours away (within the 24h email
  // window) assigned to ba@tekfilo.com (user id 2).
  const lead = await prisma.lead.create({
    data: {
      companyName: 'Deadline Test Co',
      contactPerson: 'Test Contact',
      leadSource: 'REFERRAL',
      assignedBaId: 2,
      status: 'CONTACTED',
      nextFollowUpDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  console.log('Created test lead', lead.id);

  const { dispatchDeadlineReminders } = await import('./src/lib/deadlineReminders');

  console.log('--- First dispatch run ---');
  const result1 = await dispatchDeadlineReminders();
  console.log(result1);

  const notifications = await prisma.notification.findMany({ where: { entityType: 'LEAD_FOLLOW_UP', entityId: lead.id } });
  console.log('Notifications created:', notifications.length, notifications.map((n) => n.message));

  const logs = await prisma.deadlineReminderLog.findMany({ where: { entityType: 'LEAD_FOLLOW_UP', entityId: lead.id } });
  console.log('Reminder log rows:', logs.map((l) => l.stage));

  console.log('--- Second dispatch run (should be a no-op / dedup) ---');
  const result2 = await dispatchDeadlineReminders();
  console.log(result2);

  const notifications2 = await prisma.notification.count({ where: { entityType: 'LEAD_FOLLOW_UP', entityId: lead.id } });
  console.log('Notifications after 2nd run (should be unchanged):', notifications2);

  if (etherealAccount) {
    console.log('Preview any sent test email at the URL nodemailer prints via getTestMessageUrl for real usage; skipping fetch here.');
  }

  // cleanup
  await prisma.deadlineReminderLog.deleteMany({ where: { entityType: 'LEAD_FOLLOW_UP', entityId: lead.id } });
  await prisma.notification.deleteMany({ where: { entityType: 'LEAD_FOLLOW_UP', entityId: lead.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.emailConfig.deleteMany({});
  console.log('cleaned up');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
