import prisma from '@/lib/prisma';

// Best-effort in-app notifications for manual attendance — failures are
// logged, never allowed to fail the request/decision itself (same stance as
// the leave-overlap notifications in leave-requests/mine).
export async function notifyManualAttendanceApprovers(requestId: number, employeeName: string, date: string, userIdToSkip: number | null): Promise<void> {
  try {
    const approvers = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { roles: { some: { role: { name: 'ADMIN' } } } },
          { roles: { some: { role: { permissions: { some: { permission: { name: 'approve_manual_attendance' } } } } } } },
        ],
      },
      select: { id: true },
    });
    const ids = approvers.map((a) => a.id).filter((id) => id !== userIdToSkip);
    if (!ids.length) return;
    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        title: 'Manual attendance to approve',
        message: `${employeeName} applied for manual attendance on ${date}.`,
        type: 'MANUAL_ATTENDANCE_APPLIED',
        channel: 'IN_APP',
        entityType: 'MANUAL_ATTENDANCE_REQUEST',
        entityId: requestId,
      })),
    });
  } catch (error) {
    console.error('notifyManualAttendanceApprovers failed:', error);
  }
}

export async function notifyManualAttendanceDecision(requestId: number, employeeUserId: number | null, date: string, status: string, note: string | null): Promise<void> {
  if (!employeeUserId) return;
  try {
    const verb = status === 'APPROVED' ? 'approved — the day is marked Present' : status === 'REJECTED' ? 'rejected — the day stays Absent' : 'cancelled';
    await prisma.notification.create({
      data: {
        userId: employeeUserId,
        title: `Manual attendance ${status.toLowerCase()}`,
        message: `Your manual attendance for ${date} was ${verb}.${note ? ` Note: ${note}` : ''}`,
        type: 'MANUAL_ATTENDANCE_DECIDED',
        channel: 'IN_APP',
        entityType: 'MANUAL_ATTENDANCE_REQUEST',
        entityId: requestId,
      },
    });
  } catch (error) {
    console.error('notifyManualAttendanceDecision failed:', error);
  }
}
