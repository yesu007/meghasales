import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { reprocessImport } from '@/lib/payroll/attendanceImport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Re-runs an import from its stored raw file — e.g. after HR maps an
// Access Control ID that was unmatched. Idempotent: existing punches are
// never duplicated.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('edit_timesheet');
  if (denied) return denied;

  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ message: 'Invalid import id' }, { status: 400 });
    const { importFile } = await reprocessImport(id);
    await logAudit({
      action: 'UPDATE',
      entityType: 'ATTENDANCE_IMPORT',
      entityId: importFile.id,
      newValue: { status: importFile.status, successfulRecords: importFile.successfulRecords },
      description: `Attendance log ${importFile.fileName} re-processed — ${importFile.status}`,
      request,
    });
    return NextResponse.json({ import: { id: importFile.id, status: importFile.status, errorMessage: importFile.errorMessage } });
  } catch (error: any) {
    console.error('POST /api/payroll/attendance/imports/[id]/reprocess error:', error);
    return NextResponse.json({ message: error.message || 'Failed to re-process import' }, { status: 400 });
  }
}
