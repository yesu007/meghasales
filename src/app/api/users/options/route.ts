import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// User picker data (Owner / Assigned To / Head / Participants / @mention
// dropdowns on Leads, Customers, Demos, Implementations, Meetings, Admin
// Tickets, Invoices, …). Only needs a login, not view_users: those pages
// are already gated by their own view permission, and without this every
// role lacking Users → View got "Failed to load users" there. Returns names
// only — the full user record (email, phone, roles, last login) stays behind
// view_users on GET /api/users. Same { content } shape and firstName order
// the pickers used from that endpoint.
export async function GET(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const size = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('size') || '100', 10) || 100, 1), 500);
    const users = await prisma.user.findMany({
      orderBy: { firstName: 'asc' },
      take: size,
      select: { id: true, firstName: true, lastName: true },
    });
    return NextResponse.json({ content: users.map((u) => ({ ...u, fullName: `${u.firstName} ${u.lastName}` })) });
  } catch (error) {
    console.error('GET /api/users/options error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
