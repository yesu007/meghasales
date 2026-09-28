import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// View/download an Employee legal document, decrypted server-side. Same
// view_payroll gate as GET /api/payroll/employees/[id]/documents; the
// document must belong to this employee.
export async function GET(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_employees');
  if (denied) return denied;

  const employeeId = parseInt(params.id, 10);
  const documentId = parseInt(params.documentId, 10);
  if (!employeeId || !documentId) return NextResponse.json({ message: 'Invalid document' }, { status: 400 });

  const doc = await prisma.employeeLegalDocument.findFirst({ where: { id: documentId, employeeId } });
  if (!doc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  return serveStoredDocument(request, { url: doc.filePath, fileName: doc.documentName, mimeType: doc.mimeType });
}
