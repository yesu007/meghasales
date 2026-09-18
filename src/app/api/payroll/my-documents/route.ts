import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { validateEventDocumentFile, isBlobConfigured } from '@/lib/eventDocumentUpload';
import { documentsWithUploaderNames } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// My Space > My Documents — self-service, like my-payslips/my-leave: no
// permission check, scoped to "your own data" by construction. employeeId
// is always resolved from the logged-in session's Employee (via the
// unique userId FK), never accepted from the client, so there is no
// request shape that lets an employee view or upload against another
// employee's record. There is deliberately NO DELETE handler in this
// file — see EmployeeLegalDocument's schema comment: deleting a legal
// document is only ever reachable through the Employee-module API
// (manage_employees), so this self-service surface has no delete
// capability to lock down in the first place, on the backend or the UI.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ employee: null, documents: [] });

    return NextResponse.json({
      employee: { employeeCode: employee.employeeCode },
      documents: await documentsWithUploaderNames(employee.id),
    });
  } catch (error) {
    console.error('GET /api/payroll/my-documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable document uploads' },
      { status: 503 }
    );
  }

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return NextResponse.json({ message: 'You do not have a payroll profile to upload documents against' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = String(formData.get('documentType') || '').trim();
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    if (!documentType) return NextResponse.json({ message: 'Document Type is required' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await put(`employee-legal-documents/${employee.id}/${Date.now()}-${file.name}`, file, { access: 'public' });

    const document = await prisma.employeeLegalDocument.create({
      data: {
        employeeId: employee.id,
        documentType,
        documentName: file.name,
        filePath: blob.url,
        mimeType: file.type || null,
        size: file.size,
        uploadedById: userId,
      },
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'EMPLOYEE_LEGAL_DOCUMENT',
      entityId: document.id,
      newValue: document,
      description: `Legal document "${file.name}" (${documentType}) self-uploaded by employee ${employee.employeeCode}`,
      request,
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/my-documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
