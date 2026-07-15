import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
    return NextResponse.json(roles);
  } catch (error) {
    console.error('GET /api/roles error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
