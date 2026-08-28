import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  const lead = await prisma.lead.create({
    data: { companyName: 'Deadline Test Co 2', contactPerson: 'Test', leadSource: 'REFERRAL', status: 'CONFIRMED' },
  });

  const event = await prisma.event.create({
    data: {
      leadId: lead.id,
      title: 'Kickoff call',
      eventType: 'PHONE_CALL',
      eventDateTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
      status: 'SCHEDULED',
      createdById: 3,
    },
  });

  const discussion = await prisma.eventDiscussion.create({
    data: {
      eventId: event.id,
      notes: 'Discussed scope',
      actionItems: 'Send proposal draft',
      assignedToId: 1,
      targetDate: new Date(Date.now() + 5 * 60 * 60 * 1000),
      completionStatus: 'OPEN',
    },
  });

  console.log('Created event', event.id, 'discussion', discussion.id);

  const { dispatchDeadlineReminders } = await import('./src/lib/deadlineReminders');
  const result = await dispatchDeadlineReminders();
  console.log('dispatch result:', result);

  const eventNotifs = await prisma.notification.findMany({ where: { entityType: 'EVENT', entityId: event.id } });
  const discNotifs = await prisma.notification.findMany({ where: { entityType: 'EVENT_DISCUSSION', entityId: discussion.id } });
  console.log('Event notification:', eventNotifs.map((n) => ({ userId: n.userId, message: n.message })));
  console.log('Discussion notification:', discNotifs.map((n) => ({ userId: n.userId, message: n.message })));

  // cleanup
  await prisma.deadlineReminderLog.deleteMany({ where: { OR: [{ entityType: 'EVENT', entityId: event.id }, { entityType: 'EVENT_DISCUSSION', entityId: discussion.id }] } });
  await prisma.notification.deleteMany({ where: { OR: [{ entityType: 'EVENT', entityId: event.id }, { entityType: 'EVENT_DISCUSSION', entityId: discussion.id }] } });
  await prisma.eventDiscussion.delete({ where: { id: discussion.id } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  console.log('cleaned up');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
