import { Session } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { hasPermission, hasAnyPermission } from '@/lib/permissions';

// Thin server-side wrappers around the pure logic in src/lib/permissions.ts
// (which also backs client-side UI gating via src/hooks/usePermissions.ts) —
// kept here, rather than duplicated, so a user with multiple roles is
// handled correctly by every caller at once.
export function checkPermission(session: Session | null, permission: string): boolean {
  if (!session) return false;
  return hasPermission(session.user.roles || [], session.user.permissions || [], permission);
}

export function checkAnyPermission(session: Session | null, permissions: string[]): boolean {
  if (!session) return false;
  return hasAnyPermission(session.user.roles || [], session.user.permissions || [], permissions);
}

// Bare "must be logged in" gate, no specific permission required — for
// reference/lookup endpoints (currencies, status master, quotation config)
// that every role needs but which aren't a permission-worthy action.
export async function requireAuth(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// Usage in a route handler:
//   const denied = await requirePermission('manage_invoices');
//   if (denied) return denied;
export async function requirePermission(permission: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (checkPermission(session, permission)) {
    return null;
  }

  return NextResponse.json({ message: `Forbidden — requires the "${permission}" permission` }, { status: 403 });
}

// Same as requirePermission, but passes if the session holds ANY of the
// listed permissions — e.g. discussion-create is allowed for either the
// full manage_lead_events grant or the narrower add_lead_discussion grant.
export async function requireAnyPermission(permissions: string[]): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (checkAnyPermission(session, permissions)) {
    return null;
  }

  return NextResponse.json({ message: `Forbidden — requires one of: ${permissions.join(', ')}` }, { status: 403 });
}

// Row-level "ownership" data-scope boundary — closes the audit gap where
// view_x only gated *whether* a role could open a list at all, never
// *which rows* it saw once inside (every role with view_leads saw every
// lead, full stop). Restricts a list query to rows owned by the current
// user, but ONLY for roles whose job the ownership field literally is
// (e.g. `assignedBaId` is "assigned Business Analyst" — scoping DEMO_TEAM
// by it would just break their unrelated, intentionally-broad lead
// visibility). Unassigned rows (`ownerField: null`) stay visible to
// everyone in scope so nothing becomes unclaimable/orphaned. Returns null
// (no filter — full visibility) for a role in `broadRoles`, a role not in
// `scopedRoles`, or a session that couldn't be resolved to a user id.
export async function getOwnershipFilter(
  ownerField: string,
  scopedRoles: string[],
  broadRoles: string[] = ['ADMIN', 'MANAGEMENT']
): Promise<Record<string, unknown> | null> {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles || [];
  const userId = session?.user ? parseInt(session.user.id, 10) : NaN;
  if (!session?.user || !Number.isFinite(userId)) return null;
  if (roles.some((r) => broadRoles.includes(r))) return null;
  if (!roles.some((r) => scopedRoles.includes(r))) return null;
  return { OR: [{ [ownerField]: userId }, { [ownerField]: null }] };
}
