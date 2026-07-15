import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const existing = await prisma.creditNote.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ message: 'Credit note not found' }, { status: 404 });

    const creditNote = await prisma.creditNote.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ action: 'DELETE', entityType: 'CREDIT_NOTE', entityId: id, oldValue: existing, description: `Credit note ${existing.creditNoteNumber} deleted`, request });

    return NextResponse.json(creditNote);
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete credit note' }, { status: 400 });
  }
}
