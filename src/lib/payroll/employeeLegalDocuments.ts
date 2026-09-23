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

// Flat folder list + documents (with uploader names) for one employee —
// the frontend builds the nested tree from parentId/folderId itself, same
// "flat list in, tree built client-side" shape as every other adjacency-
// list structure in this app (e.g. Employee.managerId/directReports has no
// server-side tree builder either).
export async function documentTreeForEmployee(employeeId: number) {
  const [folders, documents] = await Promise.all([
    prisma.employeeDocumentFolder.findMany({ where: { employeeId }, orderBy: { name: 'asc' } }),
    documentsWithUploaderNames(employeeId),
  ]);
  return { folders, documents };
}

export class FolderNotEmptyError extends Error {}

// Splits "Master/Sub1/Sub2" into segments and walks down from `parentId`,
// finding-or-creating each level — the New Folder input's "type a whole
// path at once" behavior. A single segment (no "/") is just the plain
// one-level case. Segment matching is scoped to (employeeId, parentId),
// same as the unique index, so "Sub1" can exist independently under two
// different parents.
export async function resolveOrCreateFolderPath(employeeId: number, parentId: number | null, path: string, createdById: number | null): Promise<number> {
  const segments = path.split('/').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) throw new Error('Folder name is required');

  let currentParentId = parentId;
  for (const name of segments) {
    const existing = await prisma.employeeDocumentFolder.findFirst({ where: { employeeId, parentId: currentParentId, name } });
    if (existing) {
      currentParentId = existing.id;
    } else {
      const created = await prisma.employeeDocumentFolder.create({ data: { employeeId, parentId: currentParentId, name, createdById } });
      currentParentId = created.id;
    }
  }
  return currentParentId!;
}

// Only ever deletes a folder holding zero direct files and zero direct
// subfolders — same conservative "empty only" rule most file managers use,
// so a folder delete can never silently take real documents with it.
export async function deleteEmptyFolder(employeeId: number, folderId: number): Promise<void> {
  const folder = await prisma.employeeDocumentFolder.findUnique({ where: { id: folderId } });
  if (!folder || folder.employeeId !== employeeId) throw new Error('Folder not found');

  const [fileCount, childCount] = await Promise.all([
    prisma.employeeLegalDocument.count({ where: { folderId } }),
    prisma.employeeDocumentFolder.count({ where: { parentId: folderId } }),
  ]);
  if (fileCount > 0 || childCount > 0) {
    throw new FolderNotEmptyError('This folder is not empty — remove its files and subfolders first');
  }

  await prisma.employeeDocumentFolder.delete({ where: { id: folderId } });
}

// Moves a document into `folderId` (null = back to root) — validates both
// the document and the destination folder actually belong to this
// employee, so a document/folder id from someone else's tree can't be
// mixed in just because the caller guessed/enumerated an id.
export async function moveDocumentToFolder(employeeId: number, documentId: number, folderId: number | null) {
  const document = await prisma.employeeLegalDocument.findUnique({ where: { id: documentId } });
  if (!document || document.employeeId !== employeeId) throw new Error('Document not found');

  if (folderId != null) {
    const folder = await prisma.employeeDocumentFolder.findUnique({ where: { id: folderId } });
    if (!folder || folder.employeeId !== employeeId) throw new Error('Destination folder not found');
  }

  return prisma.employeeLegalDocument.update({ where: { id: documentId }, data: { folderId } });
}

// Renames a folder in place — same sibling-uniqueness rule as the unique
// index (checked in application code too since Postgres treats two NULL
// parentIds as distinct, so root-level siblings wouldn't collide at the DB
// level on their own).
export async function renameFolder(employeeId: number, folderId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is required');

  const folder = await prisma.employeeDocumentFolder.findUnique({ where: { id: folderId } });
  if (!folder || folder.employeeId !== employeeId) throw new Error('Folder not found');

  const clash = await prisma.employeeDocumentFolder.findFirst({ where: { employeeId, parentId: folder.parentId, name: trimmed, NOT: { id: folderId } } });
  if (clash) throw new Error(`A folder named "${trimmed}" already exists here`);

  return prisma.employeeDocumentFolder.update({ where: { id: folderId }, data: { name: trimmed } });
}

export class InvalidFolderMoveError extends Error {}

// Moves a folder (and everything under it) to a new parent (null = root).
// Two things a plain FK update wouldn't catch on its own: moving a folder
// into itself, and moving it into one of its own descendants (which would
// otherwise silently create an unreachable cycle) — both walked/checked
// here before the update runs.
export async function moveFolder(employeeId: number, folderId: number, newParentId: number | null) {
  if (newParentId === folderId) throw new InvalidFolderMoveError('A folder cannot be moved into itself');

  const folder = await prisma.employeeDocumentFolder.findUnique({ where: { id: folderId } });
  if (!folder || folder.employeeId !== employeeId) throw new Error('Folder not found');

  if (newParentId != null) {
    const target = await prisma.employeeDocumentFolder.findUnique({ where: { id: newParentId } });
    if (!target || target.employeeId !== employeeId) throw new Error('Destination folder not found');

    const allFolders = await prisma.employeeDocumentFolder.findMany({ where: { employeeId }, select: { id: true, parentId: true } });
    const parentById = new Map(allFolders.map((f) => [f.id, f.parentId]));
    let cursor: number | null = newParentId;
    while (cursor != null) {
      if (cursor === folderId) throw new InvalidFolderMoveError('Cannot move a folder into one of its own subfolders');
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const clash = await prisma.employeeDocumentFolder.findFirst({ where: { employeeId, parentId: newParentId, name: folder.name, NOT: { id: folderId } } });
  if (clash) throw new InvalidFolderMoveError(`A folder named "${folder.name}" already exists in the destination`);

  return prisma.employeeDocumentFolder.update({ where: { id: folderId }, data: { parentId: newParentId } });
}
