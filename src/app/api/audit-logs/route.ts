import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Audit logs are append-only — written internally via logAudit(), never through this API.
// Only GET is exposed here.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const search = searchParams.get('search') || '';
    const entityType = searchParams.get('entityType') || '';
    const action = searchParams.get('action') || '';
    const userId = searchParams.get('userId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';

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

    const validSortFields = ['createdAt', 'action', 'entityType'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [logs, totalElements, actionCounts] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['action'], where, _count: { action: true } }),
    ]);

    const content = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
      userEmail: log.user?.email || null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.oldValue,
      newValue: log.newValue,
      ipAddress: log.ipAddress,
      description: log.description,
      createdAt: log.createdAt,
    }));

    const stats = { total: totalElements, create: 0, update: 0, delete: 0 };
    for (const c of actionCounts) {
      const key = c.action.toLowerCase();
      if (key === 'create') stats.create = c._count.action;
      else if (key === 'update') stats.update = c._count.action;
      else if (key === 'delete') stats.delete = c._count.action;
    }

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      stats,
    });
  } catch (error: any) {
    console.error('GET /api/audit-logs error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
