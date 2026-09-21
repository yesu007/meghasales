import prisma from '@/lib/prisma';

// Shared by both the Employee Details ("Legal Documents") admin-side route
// and My Documents' self-service route — resolves the loose uploadedById
// reference to a display name, same "no relation, resolve separately"
// convention AdminTicketAttachment.uploadedById already uses. Kept out of
// either route.ts file since Next's route module type only allows
// recognized handler exports (GET/POST/...), not arbitrary helpers.
export async function documentsWithUploaderNames(employeeId: number) {
  const documents = await prisma.employeeLegalDocument.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
  });
  const uploaderIds = Array.from(new Set(documents.map((d) => d.uploadedById).filter((id): id is number => id != null)));
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const uploaderById = new Map(uploaders.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return documents.map((d) => ({ ...d, uploadedByName: d.uploadedById != null ? uploaderById.get(d.uploadedById) ?? 'Unknown' : null }));
}
