import { NextResponse } from 'next/server';

// Decommissioned: standalone "salary resource" rows were replaced by real
// Employee records — see /api/employee-vertical-allocations. Kept as an
// inert 404 rather than deleted because the tooling available couldn't
// remove it outright; safe to delete the whole src/app/api/salary-resources
// directory by hand.
export async function GET() {
  return NextResponse.json({ message: 'Not found — use /api/employee-vertical-allocations instead' }, { status: 404 });
}
