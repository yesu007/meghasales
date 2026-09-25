import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// My Space → My Documents: view/download one of the logged-in employee's
// own documents, decrypted server-side. Self-service like GET
// /api/payroll/my-documents — the Employee is resolved from the session,
// and the document must belong to that Employee, so another employee's
// document id returns 404.
export async function GET(request: NextRequest, { params }: { params: { documentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  const userId = session?.user ? parseInt((session.user as any).id, 10) : NaN;
  if (!Number.isFinite(userId)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const documentId = parseInt(params.documentId, 10);
  if (!documentId) return NextResponse.json({ message: 'Invalid document' }, { status: 400 });

  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  const doc = await prisma.employeeLegalDocument.findFirst({ where: { id: documentId, employeeId: employee.id } });
  if (!doc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  return serveStoredDocument(request, { url: doc.filePath, fileName: doc.documentName, mimeType: doc.mimeType });
}
