// One flag gates the entire module — API routes and the nav entry. Flipping
// it off must make the app behave exactly as it did before this module
// existed. Uses the NEXT_PUBLIC_ prefix (rather than a server-only var)
// because the nav entry in dashboard/layout.tsx is a client component —
// Next.js only inlines NEXT_PUBLIC_ vars into the browser bundle, so a
// plain FEATURE_MEETINGS would read as undefined there even though it
// works fine in this file's other callers (API routes, server code). Same
// pattern as isAdminTicketModuleEnabled().
export function isMeetingsModuleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_MEETINGS === 'true';
}
