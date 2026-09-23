import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { moveDocumentToFolder } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

// Move a document into a different folder (or back to root with
// folderId: null) — gated the same as upload (manage_employees), not the
// stricter delete-only concern below: reorganizing where a file sits
// carries none of the compliance weight of removing it outright.
export async function PATCH(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const documentId = parseInt(params.documentId, 10);
    const body = await request.json();
    const folderId = body.folderId != null ? Number(body.folderId) : null;

    const document = await moveDocumentToFolder(employeeId, documentId, folderId);
    return NextResponse.json(document);
  } catch (error: any) {
    console.error('PATCH /api/payroll/employees/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to move document' }, { status: 400 });
  }
}

// Deleting is only ever reachable through this Employee-module route,
// gated by manage_employees — there's no delete endpoint under the
// self-service My Documents API at all (see /api/payroll/my-documents),
// so an employee can never delete their own document, on the backend or
// in the UI. requirePermission handles the "no permission" case (403);
// this route additionally checks the document's employeeId matches the
// employeeId in the URL, so a documentId that belongs to a different
// employee can't be deleted just because the caller happens to hold
// manage_employees and guessed/enumerated an unrelated id.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const documentId = parseInt(params.documentId, 10);

    const document = await prisma.employeeLegalDocument.findUnique({ where: { id: documentId } });
    if (!document || document.employeeId !== employeeId) {
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    await prisma.employeeLegalDocument.delete({ where: { id: documentId } });
    await logAudit({
      action: 'DELETE',
      entityType: 'EMPLOYEE_LEGAL_DOCUMENT',
      entityId: documentId,
      oldValue: document,
      description: `Legal document "${document.documentName}" deleted for employee ${employeeId}`,
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /api/payroll/employees/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete document' }, { status: 400 });
  }
}
