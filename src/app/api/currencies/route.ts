import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const currencies = await prisma.currencyMaster.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { currencyCode: 'asc' },
    });

    return NextResponse.json(currencies);
  } catch (error) {
    console.error('GET /api/currencies error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
