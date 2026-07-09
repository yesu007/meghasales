import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';

const SUPPLIER_STATE = 'TN';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { moduleCodes, clientCountry, clientState, discountPercentage = 0, addonCodes = [] } = body;

    if (!moduleCodes || moduleCodes.length === 0) {
      return NextResponse.json({ message: 'At least one module required' }, { status: 400 });
    }
    if (!clientCountry) {
      return NextResponse.json({ message: 'Client country required' }, { status: 400 });
    }

    // Load modules
    const moduleConfigs = await prisma.quotationModuleConfig.findMany({
      where: { moduleCode: { in: moduleCodes.map((c: string) => c.toUpperCase()) }, isActive: true },
    });

    // Determine currency
    const currencyCode = getCurrencyForCountry(clientCountry);
    const currency = await prisma.currencyMaster.findUnique({ where: { currencyCode } });
    const exchangeRate = currency ? Number(currency.exchangeRateToInr) : 1;
    const isInr = currencyCode === 'INR';

    // Module line items
    const modules = moduleConfigs.map((m) => {
      const price = Number(m.baseLicenseCost);
      return {
        moduleCode: m.moduleCode,
        moduleName: m.moduleName,
        basePrice: isInr ? price : round(price / exchangeRate),
      };
    });
    const modulesSubtotal = modules.reduce((sum, m) => sum + m.basePrice, 0);

    // Use first module for service costs
    const primary = moduleConfigs[0];
    const convert = (val: Decimal | number) => {
      const n = Number(val);
      return isInr ? n : round(n / exchangeRate);
    };

    const implementationCost = primary ? convert(primary.implementationCost) : 0;
    const dataMigrationCost = primary ? convert(primary.dataMigrationCost) : 0;
    const trainingCost = primary ? convert(primary.trainingCost) : 0;
    const cloudHostingCost = primary ? convert(primary.cloudHostingCost) : 0;
    const annualMaintenanceCost = primary ? convert(primary.annualMaintenanceCost) : 0;
    const supportCharges = primary ? convert(primary.supportCharges) : 0;
    const oneTimeSetupFee = primary ? convert(primary.oneTimeSetupFee) : 0;

    // Add-ons
    let addonsCost = 0;
    const addonItems: { addonCode: string; addonName: string; price: number }[] = [];
    if (addonCodes.length > 0) {
      const addons = await prisma.quotationAddonConfig.findMany({
        where: { addonCode: { in: addonCodes }, isActive: true },
      });
      for (const a of addons) {
        const price = convert(a.price);
        addonItems.push({ addonCode: a.addonCode, addonName: a.addonName, price });
        addonsCost += price;
      }
    }

    const subtotal = modulesSubtotal + implementationCost + dataMigrationCost + trainingCost +
      cloudHostingCost + annualMaintenanceCost + supportCharges + oneTimeSetupFee + addonsCost;

    const discountAmount = round(subtotal * discountPercentage / 100);
    const taxableAmount = subtotal - discountAmount;

    // Calculate taxes
    const taxBreakdown = await calculateTaxes(clientCountry, clientState, taxableAmount, isInr, exchangeRate);
    const totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
    const grandTotal = round(taxableAmount + totalTax);

    return NextResponse.json({
      currencyCode,
      currencySymbol: currency?.currencySymbol || '₹',
      exchangeRate,
      modules,
      modulesSubtotal: round(modulesSubtotal),
      implementationCost: round(implementationCost),
      dataMigrationCost: round(dataMigrationCost),
      trainingCost: round(trainingCost),
      customDevelopmentCost: 0,
      cloudHostingCost: round(cloudHostingCost),
      annualMaintenanceCost: round(annualMaintenanceCost),
      supportCharges: round(supportCharges),
      oneTimeSetupFee: round(oneTimeSetupFee),
      addonsCost: round(addonsCost),
      subtotal: round(subtotal),
      discountPercentage,
      discountAmount: round(discountAmount),
      taxBreakdown,
      totalTax: round(totalTax),
      grandTotal,
      addons: addonItems,
    });
  } catch (error: any) {
    console.error('Calculate error:', error);
    return NextResponse.json({ message: error.message || 'Calculation failed' }, { status: 500 });
  }
}

async function calculateTaxes(countryCode: string, stateCode: string | undefined, taxableAmount: number, isInr: boolean, exchangeRate: number) {
  const taxes: { taxName: string; taxType: string; rate: number; amount: number }[] = [];

  if (countryCode === 'IN') {
    const isSameState = stateCode?.toUpperCase() === SUPPLIER_STATE;
    if (isSameState && stateCode) {
      const stateTaxes = await prisma.stateTaxMaster.findMany({
        where: { countryCode: 'IN', stateCode: stateCode.toUpperCase(), isActive: true },
      });
      for (const t of stateTaxes) {
        const rate = Number(t.rate);
        taxes.push({ taxName: t.taxName, taxType: t.taxType, rate, amount: round(taxableAmount * rate / 100) });
      }
      if (taxes.length === 0) {
        taxes.push({ taxName: 'CGST', taxType: 'CGST', rate: 9, amount: round(taxableAmount * 9 / 100) });
        taxes.push({ taxName: 'SGST', taxType: 'SGST', rate: 9, amount: round(taxableAmount * 9 / 100) });
      }
    } else {
      taxes.push({ taxName: 'IGST', taxType: 'IGST', rate: 18, amount: round(taxableAmount * 18 / 100) });
    }
  } else {
    const countryTaxes = await prisma.countryTaxMaster.findMany({
      where: { countryCode: countryCode.toUpperCase(), isActive: true },
    });
    for (const t of countryTaxes) {
      const rate = Number(t.defaultRate);
      if (rate > 0) {
        taxes.push({ taxName: t.taxName, taxType: t.taxType, rate, amount: round(taxableAmount * rate / 100) });
      }
    }
    // US state tax
    if (countryCode === 'US' && stateCode) {
      const stateTaxes = await prisma.stateTaxMaster.findMany({
        where: { countryCode: 'US', stateCode: stateCode.toUpperCase(), isActive: true },
      });
      for (const t of stateTaxes) {
        const rate = Number(t.rate);
        taxes.push({ taxName: t.taxName, taxType: t.taxType, rate, amount: round(taxableAmount * rate / 100) });
      }
    }
  }

  return taxes;
}

function getCurrencyForCountry(country: string): string {
  const map: Record<string, string> = {
    IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SA: 'SAR',
    SG: 'SGD', AU: 'AUD', CA: 'CAD', TH: 'THB', CN: 'CNY', HK: 'HKD',
    DE: 'EUR', FR: 'EUR', IT: 'EUR',
  };
  return map[country?.toUpperCase()] || 'USD';
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
