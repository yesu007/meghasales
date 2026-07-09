import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { module: string } }) {
  try {
    const statuses = await prisma.statusMaster.findMany({
      where: { module: params.module.toUpperCase(), isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    return NextResponse.json(statuses);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
