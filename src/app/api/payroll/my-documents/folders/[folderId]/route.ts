import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { deleteEmptyFolder, FolderNotEmptyError, renameFolder, moveFolder, InvalidFolderMoveError } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Self-service — rename and/or move (to a new parent, null = root) one of
// the employee's own folders. Same organization-only reasoning as create/
// delete: no compliance weight, so no extra permission beyond being this
// employee.
export async function PATCH(request: NextRequest, { params }: { params: { folderId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await findEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile' }, { status: 404 });

    const folderId = parseInt(params.folderId, 10);
    const body = await request.json();

    let folder;
    if (body.name !== undefined) folder = await renameFolder(employee.id, folderId, String(body.name));
    if (body.parentId !== undefined) folder = await moveFolder(employee.id, folderId, body.parentId != null ? Number(body.parentId) : null);
    if (!folder) return NextResponse.json({ message: 'name or parentId is required' }, { status: 400 });

    await logAudit({ action: 'UPDATE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder ${folderId} self-updated by employee ${employee.employeeCode}`, request });
    return NextResponse.json(folder);
  } catch (error: any) {
    if (error instanceof InvalidFolderMoveError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/payroll/my-documents/folders/[folderId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update folder' }, { status: 400 });
  }
}

// Self-service — an employee can delete their own EMPTY folders (pure
// organization, no compliance weight), even though they still can't
// delete the actual documents inside one (see my-documents' own comment on
// why that stays admin-only).
export async function DELETE(request: NextRequest, { params }: { params: { folderId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await findEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile' }, { status: 404 });

    const folderId = parseInt(params.folderId, 10);
    await deleteEmptyFolder(employee.id, folderId);
    await logAudit({ action: 'DELETE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder ${folderId} self-deleted by employee ${employee.employeeCode}`, request });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof FolderNotEmptyError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error('DELETE /api/payroll/my-documents/folders/[folderId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete folder' }, { status: 400 });
  }
}
