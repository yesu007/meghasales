import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

interface LogAuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  description?: string;
  request?: NextRequest;
}

// Prisma Decimal/Date instances aren't plain JSON values; round-tripping
// through JSON collapses them to the same strings Prisma would render anyway.
function toJsonSafe(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stripSensitive(value: unknown) {
  if (value && typeof value === 'object' && 'password' in (value as Record<string, unknown>)) {
    const { password, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
}

function extractIp(request?: NextRequest): string | null {
  if (!request) return null;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

// Audit logging is best-effort: it must never throw, since a logging
// failure should not block or fail the mutation it's recording.
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? parseInt((session.user as any).id, 10) : null;

    await prisma.auditLog.create({
      data: {
        userId: Number.isFinite(userId) ? userId : null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        oldValue: toJsonSafe(stripSensitive(params.oldValue)),
        newValue: toJsonSafe(stripSensitive(params.newValue)),
        ipAddress: extractIp(params.request),
        description: params.description ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
