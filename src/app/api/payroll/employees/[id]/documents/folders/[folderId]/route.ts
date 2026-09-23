import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { deleteEmptyFolder, FolderNotEmptyError, renameFolder, moveFolder, InvalidFolderMoveError } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

// Rename (`name`) and/or move to a new parent (`parentId`, null = root) —
// same gate as upload/folder-create (manage_employees).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; folderId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const folderId = parseInt(params.folderId, 10);
    const body = await request.json();

    let folder;
    if (body.name !== undefined) folder = await renameFolder(employeeId, folderId, String(body.name));
    if (body.parentId !== undefined) folder = await moveFolder(employeeId, folderId, body.parentId != null ? Number(body.parentId) : null);
    if (!folder) return NextResponse.json({ message: 'name or parentId is required' }, { status: 400 });

    await logAudit({ action: 'UPDATE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder ${folderId} updated for employee ${employeeId}`, request });
    return NextResponse.json(folder);
  } catch (error: any) {
    if (error instanceof InvalidFolderMoveError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/payroll/employees/[id]/documents/folders/[folderId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update folder' }, { status: 400 });
  }
}

// Only ever deletes an empty folder (zero direct files, zero direct
// subfolders) — see deleteEmptyFolder's own comment.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; folderId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const folderId = parseInt(params.folderId, 10);

    await deleteEmptyFolder(employeeId, folderId);
    await logAudit({ action: 'DELETE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder ${folderId} deleted for employee ${employeeId}`, request });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof FolderNotEmptyError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error('DELETE /api/payroll/employees/[id]/documents/folders/[folderId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete folder' }, { status: 400 });
  }
}
