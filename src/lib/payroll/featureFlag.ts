// One flag gates the entire module — schema is Phase 0 only, but the nav
// entry and every /api/payroll/* route (added in later phases) all check
// this same flag. Flipping it off must make the app behave exactly as it
// did before this module existed. NEXT_PUBLIC_ prefix (rather than a
// server-only var) because the nav entry in dashboard/layout.tsx is a
// client component — see isAdminTicketModuleEnabled() for the identical
// reasoning, this module follows that precedent exactly.
export function isPayrollModuleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_PAYROLL === 'true';
}
