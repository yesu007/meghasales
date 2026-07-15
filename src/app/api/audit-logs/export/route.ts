import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Safety cap so an unfiltered export on a large table can't exhaust memory.
const MAX_EXPORT_ROWS = 10000;

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const entityType = searchParams.get('entityType') || '';
    const action = searchParams.get('action') || '';
    const userId = searchParams.get('userId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: Prisma.AuditLogWhereInput = {};
    const AND: Prisma.AuditLogWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim();
      AND.push({
        OR: [
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { entityType: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }
    if (entityType) AND.push({ entityType: entityType.toUpperCase() });
    if (action) AND.push({ action: action.toUpperCase() });
    if (userId) AND.push({ userId: parseInt(userId) });
    if (dateFrom) AND.push({ createdAt: { gte: new Date(dateFrom) } });
    if (dateTo) AND.push({ createdAt: { lte: new Date(dateTo) } });

    if (AND.length > 0) where.AND = AND;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      take: MAX_EXPORT_ROWS,
    });

    const header = ['ID', 'Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Description', 'IP Address'];
    const rows = logs.map((log) => [
      log.id,
      log.createdAt.toISOString(),
      log.user ? `${log.user.firstName} ${log.user.lastName} (${log.user.email})` : 'System',
      log.action,
      log.entityType || '',
      log.entityId ?? '',
      log.description || '',
      log.ipAddress || '',
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/audit-logs/export error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
