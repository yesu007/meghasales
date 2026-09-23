import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { resolveOrCreateFolderPath } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Self-service — no permission check, scoped to the logged-in employee's
// own tree only, same as the rest of My Documents.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile to organize documents against' }, { status: 404 });

    const body = await request.json();
    const path = String(body.path || '').trim();
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    if (!path) return NextResponse.json({ message: 'Folder name is required' }, { status: 400 });

    if (parentId != null) {
      const parent = await prisma.employeeDocumentFolder.findUnique({ where: { id: parentId } });
      if (!parent || parent.employeeId !== employee.id) return NextResponse.json({ message: 'Parent folder not found' }, { status: 404 });
    }

    const folderId = await resolveOrCreateFolderPath(employee.id, parentId, path, userId);

    await logAudit({ action: 'CREATE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder "${path}" self-created by employee ${employee.employeeCode}`, request });

    const folders = await prisma.employeeDocumentFolder.findMany({ where: { employeeId: employee.id }, orderBy: { name: 'asc' } });
    return NextResponse.json({ folderId, folders }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/my-documents/folders error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create folder' }, { status: 400 });
  }
}
