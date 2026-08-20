// Pure boolean RBAC logic — no server-only imports (no next/server,
// getServerSession, or Prisma), so it's safe to import from client
// components too. src/lib/rbac.ts wraps this for HTTP route guards;
// src/hooks/usePermissions.ts wraps this for client-side UI gating. Keeping
// the actual ADMIN-bypass-or-permission-membership rule in exactly one place
// means a user with multiple roles is handled correctly everywhere at once.

export function hasPermission(roles: string[], permissions: string[], required: string): boolean {
  return roles.includes('ADMIN') || permissions.includes(required);
}

export function hasAnyPermission(roles: string[], permissions: string[], required: string[]): boolean {
  return roles.includes('ADMIN') || required.some((p) => permissions.includes(p));
}
