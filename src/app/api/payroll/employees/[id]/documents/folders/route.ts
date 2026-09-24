import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { resolveOrCreateFolderPath } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

// Creates a folder, or a whole "Master/Sub1/Sub2" chain in one call, under
// `parentId` (null = root) — same gate as file upload (manage_employees),
// not a separate permission: organizing your own attachments carries none
// of the compliance weight of the documents themselves.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const path = String(body.path || '').trim();
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    if (!path) return NextResponse.json({ message: 'Folder name is required' }, { status: 400 });

    if (parentId != null) {
      const parent = await prisma.employeeDocumentFolder.findUnique({ where: { id: parentId } });
      if (!parent || parent.employeeId !== employeeId) return NextResponse.json({ message: 'Parent folder not found' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const folderId = await resolveOrCreateFolderPath(employeeId, parentId, path, Number.isFinite(createdById) ? createdById : null);

    await logAudit({ action: 'CREATE', entityType: 'EMPLOYEE_DOCUMENT_FOLDER', entityId: folderId, description: `Folder "${path}" created for employee ${employee.employeeCode}`, request });

    const folders = await prisma.employeeDocumentFolder.findMany({ where: { employeeId }, orderBy: { name: 'asc' } });
    return NextResponse.json({ folderId, folders }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees/[id]/documents/folders error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create folder' }, { status: 400 });
  }
}
