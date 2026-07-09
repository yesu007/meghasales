import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/quotation-config/modules
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'addons') {
      const addons = await prisma.quotationAddonConfig.findMany({ where: { isActive: true } });
      return NextResponse.json(addons);
    }
    if (type === 'currencies') {
      const currencies = await prisma.currencyMaster.findMany({ where: { isActive: true } });
      return NextResponse.json(currencies);
    }
    if (type === 'company-profile') {
      const profile = await prisma.companyProfile.findFirst({ where: { isActive: true } });
      return NextResponse.json(profile);
    }

    // Default: modules
    const modules = await prisma.quotationModuleConfig.findMany({ where: { isActive: true } });
    return NextResponse.json(modules);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
