import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Retained history of a quotation's prior states (see QuotationRevision in
// prisma/schema.prisma) — newest first, each entry the full row as it stood
// immediately before the edit that superseded it.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_quotations');
  if (denied) return denied;

  try {
    const quotationId = parseInt(params.id);
    const revisions = await prisma.quotationRevision.findMany({
      where: { quotationId },
      orderBy: { versionNumber: 'desc' },
    });

    const revisedByIds = Array.from(new Set(revisions.map((r) => r.revisedById).filter((id): id is number => id != null)));
    const users = revisedByIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: revisedByIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userNameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return NextResponse.json(revisions.map((r) => ({
      id: r.id,
      versionNumber: r.versionNumber,
      snapshot: r.snapshot,
      revisedByName: r.revisedById ? userNameById.get(r.revisedById) || null : null,
      createdAt: r.createdAt,
    })));
  } catch (error) {
    console.error('GET /api/quotations/[id]/revisions error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
