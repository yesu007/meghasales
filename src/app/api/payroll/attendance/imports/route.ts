import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { importAttendanceFile, isLoginLogoutWorkbook } from '@/lib/payroll/attendanceImport';
import { isAttendanceSftpConfigured } from '@/lib/payroll/attendanceSftp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEVICE_LOG_RE = /\.(dat|dot)$/i;

// Import history for the Time & Attendance → Attendance Log screen.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_timesheet');
  if (denied) return denied;

  try {
    const imports = await prisma.attendanceImportFile.findMany({ orderBy: { uploadedAt: 'desc' }, take: 50, include: { _count: { select: { punches: true } } } });
    // The unmatched list is what was unmatched when the file was imported;
    // flag the IDs HR has mapped since, so the history doesn't read as open.
    const unmatchedIds = new Set<string>();
    for (const i of imports) for (const u of ((i.details as any)?.unmatchedIds || []) as { accessControlId: string }[]) unmatchedIds.add(u.accessControlId);
    const mapped = unmatchedIds.size
      ? await prisma.employee.findMany({ where: { accessControlId: { in: Array.from(unmatchedIds) } }, select: { accessControlId: true, firstName: true, lastName: true, employeeCode: true } })
      : [];
    const mappedTo = new Map(mapped.map((e) => [e.accessControlId!, `${e.firstName} ${e.lastName}`.replace(/\s+/g, ' ').trim() + ` (${e.employeeCode})`]));
    return NextResponse.json({
      sftpConfigured: isAttendanceSftpConfigured(),
      imports: imports.map(({ fileHash: _h, rawFileUrl, excelFileUrl, details, _count, ...rest }) => {
        const d = (details as Record<string, any> | null) || {};
        return {
          ...rest,
          hasRawFile: !!rawFileUrl,
          punchesAdded: _count.punches,
          hasExcel: !!excelFileUrl || !!d.dateRange,
          excelStored: !!excelFileUrl,
          dateRange: d.dateRange || null,
          unmatchedIds: ((d.unmatchedIds || []) as { accessControlId: string }[]).map((u) => ({ ...u, mappedTo: mappedTo.get(u.accessControlId) || null })),
          invalidRows: d.invalidRows || [],
        };
      }),
    });
  } catch (error) {
    console.error('GET /api/payroll/attendance/imports error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Manual upload — exactly one file per request, either the Login/Logout
// Excel workbook (kind=excel: Employee ID, Employee Name, Date, Login,
// Logout, Hours Worked) or the device's raw attendance log (kind=dat, the
// same file SFTP delivers). Both run through the same pipeline; the
// browser only transfers the file — all parsing happens here.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('create_timesheet');
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const kind = String(form.get('kind') || '');
    if (form.getAll('file').length > 1) return NextResponse.json({ message: 'Upload one file at a time' }, { status: 400 });
    if (!file || typeof file === 'string' || file.size === 0) return NextResponse.json({ message: 'Choose an Excel (.xlsx) or device log (.dat) file to upload' }, { status: 400 });
    if (kind === 'excel' && !isLoginLogoutWorkbook(file.name)) return NextResponse.json({ message: 'Excel upload needs the Login/Logout workbook (.xlsx)' }, { status: 400 });
    if (kind === 'dat' && !DEVICE_LOG_RE.test(file.name)) return NextResponse.json({ message: 'Device log upload needs the attendance log file (.dat)' }, { status: 400 });
    if (!isLoginLogoutWorkbook(file.name) && !DEVICE_LOG_RE.test(file.name)) return NextResponse.json({ message: 'Only the Login/Logout Excel (.xlsx) or the device attendance log (.dat) can be uploaded' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ message: 'File is too large (max 20 MB)' }, { status: 400 });

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const { skipped, importFile } = await importAttendanceFile({
      fileName: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      source: 'UPLOAD',
      createdById: Number.isFinite(createdById) ? createdById : null,
    });

    if (!skipped) {
      await logAudit({
        action: 'CREATE',
        entityType: 'ATTENDANCE_IMPORT',
        entityId: importFile.id,
        newValue: { fileName: importFile.fileName, status: importFile.status, successfulRecords: importFile.successfulRecords },
        description: `Attendance ${isLoginLogoutWorkbook(importFile.fileName) ? 'Excel' : 'device log'} ${importFile.fileName} uploaded — ${importFile.status}`,
        request,
      });
    }
    return NextResponse.json({ skipped, import: { id: importFile.id, status: importFile.status, fileName: importFile.fileName, errorMessage: importFile.errorMessage } });
  } catch (error: any) {
    console.error('POST /api/payroll/attendance/imports error:', error);
    return NextResponse.json({ message: error.message || 'Failed to import attendance file' }, { status: 500 });
  }
}
