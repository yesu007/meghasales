import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { put } from '@/lib/storage';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { validateEventDocumentFile, isStorageConfigured } from '@/lib/eventDocumentUpload';
import { documentsWithUploaderNames } from '@/lib/payroll/employeeLegalDocuments';

export const dynamic = 'force-dynamic';

// HR/admin side — Employee Details > Legal Documents. Same page also
// serves as "Payroll Employee", so this one route covers both.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    return NextResponse.json(await documentsWithUploaderNames(employeeId));
  } catch (error) {
    console.error('GET /api/payroll/employees/[id]/documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable document uploads' },
      { status: 503 }
    );
  }

  try {
    const employeeId = parseInt(params.id, 10);
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = String(formData.get('documentType') || '').trim();
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    if (!documentType) return NextResponse.json({ message: 'Document Type is required' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await put(`employee-legal-documents/${employeeId}/${Date.now()}-${file.name}`, file, { access: 'public' });

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const document = await prisma.employeeLegalDocument.create({
      data: {
        employeeId,
        documentType,
        documentName: file.name,
        filePath: blob.url,
        mimeType: file.type || null,
        size: file.size,
        uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'EMPLOYEE_LEGAL_DOCUMENT',
      entityId: document.id,
      newValue: document,
      description: `Legal document "${file.name}" (${documentType}) uploaded for employee ${employee.employeeCode}`,
      request,
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees/[id]/documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
