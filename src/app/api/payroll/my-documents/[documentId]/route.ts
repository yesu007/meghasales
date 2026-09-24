import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { moveDocumentToFolder } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Move-only — deliberately no DELETE here, same "an employee can reorganize
// but never remove their own uploaded document" boundary as the rest of
// My Documents (see my-documents/route.ts's own comment).
export async function PATCH(request: NextRequest, { params }: { params: { documentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await findEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile' }, { status: 404 });

    const documentId = parseInt(params.documentId, 10);
    const body = await request.json();
    const folderId = body.folderId != null ? Number(body.folderId) : null;

    const document = await moveDocumentToFolder(employee.id, documentId, folderId);
    return NextResponse.json(document);
  } catch (error: any) {
    console.error('PATCH /api/payroll/my-documents/[documentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to move document' }, { status: 400 });
  }
}
