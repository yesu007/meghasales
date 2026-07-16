import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

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

  const role = (session.user as any)?.role;
  const permissions: string[] = (session.user as any)?.permissions || [];

  // ADMIN is treated as implicitly all-permissioned, matching its seeded
  // "Full system access" description — a safety net independent of
  // whichever RolePermission grants happen to exist in a given database.
  if (role === 'ADMIN' || permissions.includes(permission)) {
    return null;
  }

  return NextResponse.json({ message: `Forbidden — requires the "${permission}" permission` }, { status: 403 });
}
