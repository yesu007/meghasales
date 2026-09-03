import { NextResponse } from 'next/server';

// Decommissioned: the "allocation category" concept was folded into the
// existing Vertical master (see /api/verticals) once it became clear the
// two lists were the same thing — see EmployeeVerticalAllocation in
// schema.prisma. This file is kept as an inert 404 rather than deleted
// because the tooling available couldn't remove it outright; safe to
// delete the whole src/app/api/allocation-categories directory by hand.
export async function GET() {
  return NextResponse.json({ message: 'Not found — use /api/verticals instead' }, { status: 404 });
}
