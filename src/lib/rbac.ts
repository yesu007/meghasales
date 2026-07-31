import { Session } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Pure ADMIN-bypass-or-permission-membership check, factored out so both the
// HTTP-route guards below and non-HTTP consumers (e.g. the assistant tool
// registry in src/lib/assistant/registry.ts, which can't return a
// NextResponse) share one source of truth instead of duplicating this logic.
export function checkPermission(session: Session | null, permission: string): boolean {
  if (!session) return false;
  const role = (session.user as any)?.role;
  const permissions: string[] = (session.user as any)?.permissions || [];

  // ADMIN is treated as implicitly all-permissioned, matching its seeded
  // "Full system access" description — a safety net independent of
  // whichever RolePermission grants happen to exist in a given database.
  return role === 'ADMIN' || permissions.includes(permission);
}

// Same as checkPermission, but passes if the session holds ANY of the listed
// permissions — e.g. discussion-create is allowed for either the full
// manage_lead_events grant or the narrower add_lead_discussion grant.
export function checkAnyPermission(session: Session | null, permissions: string[]): boolean {
  if (!session) return false;
  const role = (session.user as any)?.role;
  const granted: string[] = (session.user as any)?.permissions || [];

  return role === 'ADMIN' || permissions.some((p) => granted.includes(p));
}

// The Role/Permission/RolePermission schema and session.user.permissions
// (populated at login in src/lib/auth.ts) have existed since early in this
// project but were never actually checked anywhere — every route in the
// app is currently open to any authenticated (or even unauthenticated,
// since nothing checks the session either) request. The Accounting module
// is the first real consumer of this system, so this stays scoped to
// /api/accounting/* only rather than retrofitting checks onto unrelated
// existing routes.
//
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
