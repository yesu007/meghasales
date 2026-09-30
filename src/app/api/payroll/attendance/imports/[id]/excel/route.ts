import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { getImportWorkbook } from '@/lib/payroll/attendanceImport';
import { XLSX_CONTENT_TYPE } from '@/lib/payroll/attendanceExcel';

export const dynamic = 'force-dynamic';

// Normalized Login/Logout workbook for one import, streamed through the
// backend (the S3 object itself is never linked to directly).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_timesheet');
  if (denied) return denied;

  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ message: 'Invalid import id' }, { status: 400 });
    const { fileName, content } = await getImportWorkbook(id);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${fileName.replace(/["\\\r\n]/g, '_')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('GET /api/payroll/attendance/imports/[id]/excel error:', error);
    return NextResponse.json({ message: error.message || 'Failed to build workbook' }, { status: 400 });
  }
}
