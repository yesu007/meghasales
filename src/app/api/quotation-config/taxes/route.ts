import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/quotation-config/taxes?country=IN or ?country=IN&state=TN
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get('country') || '';
  const stateCode = searchParams.get('state') || '';
  const type = searchParams.get('type') || 'country'; // 'country', 'states', 'all'

  try {
    if (type === 'states' && countryCode) {
      // Get distinct states for a country
      const states = await prisma.stateTaxMaster.findMany({
        where: { countryCode: countryCode.toUpperCase(), isActive: true },
        select: { stateCode: true, stateName: true },
        distinct: ['stateCode'],
        orderBy: { stateName: 'asc' },
      });
      return NextResponse.json(states);
    }

    if (type === 'all') {
      const taxes = await prisma.countryTaxMaster.findMany({ where: { isActive: true } });
      return NextResponse.json(taxes);
    }

    if (countryCode && stateCode) {
      const stateTaxes = await prisma.stateTaxMaster.findMany({
        where: { countryCode: countryCode.toUpperCase(), stateCode: stateCode.toUpperCase(), isActive: true },
      });
      return NextResponse.json(stateTaxes);
    }

    if (countryCode) {
      const taxes = await prisma.countryTaxMaster.findMany({
        where: { countryCode: countryCode.toUpperCase(), isActive: true },
      });
      return NextResponse.json(taxes);
    }

    // All country taxes
    const taxes = await prisma.countryTaxMaster.findMany({ where: { isActive: true } });
    return NextResponse.json(taxes);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
