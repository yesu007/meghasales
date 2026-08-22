import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';

// SMTP credentials live in the email_config table (edited from the
// Settings → Email tab) rather than env vars, since they're meant to be
// changeable by an admin without a redeploy. Fetched fresh on every send —
// volume here is low (deadline-reminder escalations, occasional test
// sends), so there's no need to cache/invalidate.
export async function getEmailConfig() {
  return prisma.emailConfig.findFirst({ orderBy: { id: 'asc' } });
}

export async function isMailConfigured(): Promise<boolean> {
  const config = await getEmailConfig();
  return !!(config?.isActive && config.smtpHost && config.smtpUser && config.smtpPassword && config.fromEmail);
}

export interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Throws on misconfiguration or a transport failure — callers that treat
// email as a best-effort escalation (see deadlineReminders.ts) are
// responsible for catching, exactly like sendPushToUser's callers do for
// push. No caching of the transporter: config can change between calls.
export async function sendMail(payload: MailPayload): Promise<void> {
  const config = await getEmailConfig();
  if (!config?.isActive || !config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.fromEmail) {
    throw new Error('Email is not configured');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });

  await transporter.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}
