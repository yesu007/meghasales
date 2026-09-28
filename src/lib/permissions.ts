// Pure boolean RBAC logic — no server-only imports (no next/server,
// getServerSession, or Prisma), so it's safe to import from client
// components too. src/lib/rbac.ts wraps this for HTTP route guards;
// src/hooks/usePermissions.ts wraps this for client-side UI gating. Keeping
// the rule in exactly one place means a user with multiple roles is handled
// correctly everywhere at once.
//
// There is deliberately no role-name bypass: ADMIN, like every other role,
// is authorized only by the permissions granted to it on the Roles screen
// (the union across all of a user's roles). `roles` stays in the signature
// so existing callers don't change.

export function hasPermission(_roles: string[], permissions: string[], required: string): boolean {
  return permissions.includes(required);
}

export function hasAnyPermission(_roles: string[], permissions: string[], required: string[]): boolean {
  return required.some((p) => permissions.includes(p));
}
