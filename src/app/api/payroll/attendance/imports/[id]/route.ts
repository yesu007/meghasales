import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { deleteImport } from '@/lib/payroll/attendanceImport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Removes an import and the attendance punches it added (see deleteImport).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('delete_timesheet');
  if (denied) return denied;

  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ message: 'Invalid import id' }, { status: 400 });
    const { fileName, punchesRemoved } = await deleteImport(id);
    await logAudit({
      action: 'DELETE',
      entityType: 'ATTENDANCE_IMPORT',
      entityId: id,
      oldValue: { fileName, punchesRemoved },
      description: `Attendance import ${fileName} deleted — ${punchesRemoved} punch(es) removed`,
      request,
    });
    return NextResponse.json({ fileName, punchesRemoved });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ message: 'Import not found' }, { status: 404 });
    console.error('DELETE /api/payroll/attendance/imports/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete import' }, { status: 400 });
  }
}
