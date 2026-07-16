import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const country = await prisma.country.findUnique({ where: { id: parseInt(params.id) } });
    if (!country) return NextResponse.json({ message: 'Country not found' }, { status: 404 });
    return NextResponse.json(country);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_countries');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.country.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Country not found' }, { status: 404 });

    let currencyFields = {};
    if (body.currencyCode !== undefined) {
      const currency = await prisma.currencyMaster.findUnique({ where: { currencyCode: body.currencyCode } });
      if (!currency) {
        return NextResponse.json({ message: `No currency "${body.currencyCode}" found in Currency Master` }, { status: 400 });
      }
      currencyFields = { currencyCode: currency.currencyCode, currencyName: currency.currencyName, currencySymbol: currency.currencySymbol };
    }

    const country = await prisma.country.update({
      where: { id },
      data: {
        ...(body.countryName !== undefined && { countryName: body.countryName }),
        ...(body.isoCode !== undefined && { isoCode: body.isoCode.toUpperCase() }),
        ...currencyFields,
        ...(body.defaultTaxType !== undefined && { defaultTaxType: body.defaultTaxType }),
        ...(body.defaultTaxPercentage !== undefined && { defaultTaxPercentage: body.defaultTaxPercentage }),
        ...(body.flagEmoji !== undefined && { flagEmoji: body.flagEmoji }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json(country);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A country with this ISO code already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: error.message || 'Failed to update country' }, { status: 400 });
  }
}

// Countries are deactivated, not hard-deleted — a hard delete would fail
// once any Lead references it via countryId (RESTRICT-by-default FK
// behavior), matching the isActive-flag retirement pattern already used by
// CurrencyMaster/CountryTaxMaster.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_countries');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.country.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Country not found' }, { status: 404 });

    const country = await prisma.country.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json(country);
  } catch (error) {
    return NextResponse.json({ message: 'Failed to deactivate country' }, { status: 400 });
  }
}
