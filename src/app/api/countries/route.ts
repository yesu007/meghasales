import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const countries = await prisma.country.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { countryName: 'asc' },
    });

    return NextResponse.json(countries);
  } catch (error: any) {
    console.error('GET /api/countries error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_countries');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.countryName || !body.isoCode || !body.currencyCode || !body.defaultTaxType) {
      return NextResponse.json({ message: 'countryName, isoCode, currencyCode, and defaultTaxType are required' }, { status: 400 });
    }

    const currency = await prisma.currencyMaster.findUnique({ where: { currencyCode: body.currencyCode } });
    if (!currency) {
      return NextResponse.json({ message: `No currency "${body.currencyCode}" found in Currency Master` }, { status: 400 });
    }

    const country = await prisma.country.create({
      data: {
        countryName: body.countryName,
        isoCode: body.isoCode.toUpperCase(),
        currencyCode: currency.currencyCode,
        currencyName: currency.currencyName,
        currencySymbol: currency.currencySymbol,
        defaultTaxType: body.defaultTaxType,
        defaultTaxPercentage: body.defaultTaxPercentage ?? 0,
        flagEmoji: body.flagEmoji || null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(country, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A country with this ISO code already exists' }, { status: 409 });
    }
    console.error('POST /api/countries error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create country' }, { status: 400 });
  }
}
