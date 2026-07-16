import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { resolveTaxRates, type TaxRate } from '@/lib/taxCalculation';

export const dynamic = 'force-dynamic';

const DEFAULT_SUPPLIER_STATE = 'TN';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { moduleCodes, clientCountry, clientState, discountPercentage = 0, addonCodes = [] } = body;

    if (!Array.isArray(moduleCodes)) {
      return NextResponse.json({ message: 'moduleCodes must be an array' }, { status: 400 });
    }
    if (!clientCountry) {
      return NextResponse.json({ message: 'Client country required' }, { status: 400 });
    }

    // Load modules
    const moduleConfigs = await prisma.quotationModuleConfig.findMany({
      where: { moduleCode: { in: moduleCodes.map((c: string) => c.toUpperCase()) }, isActive: true },
    });

    // Determine currency from the Country master — replaces the old
    // hardcoded country->currency map, which had drifted out of sync with
    // what's actually seeded (some mapped countries had no CurrencyMaster
    // row at all).
    const countryRow = await prisma.country.findUnique({ where: { isoCode: clientCountry.toUpperCase() } });
    const currencyCode = countryRow?.currencyCode || 'USD';
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
    const taxRates = await resolveApplicableTaxRates(clientCountry, clientState);
    const taxBreakdown = taxRates.map((t) => ({ ...t, amount: round(taxableAmount * t.rate / 100) }));
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

// Fetches the config rows relevant to this country/state and delegates the
// actual rate-selection decision to the pure resolveTaxRates() (which rows
// win, and what the hardcoded fallback is) so that logic stays unit-testable
// without a database.
async function resolveApplicableTaxRates(countryCode: string, stateCode: string | undefined): Promise<TaxRate[]> {
  const upperCountry = countryCode.toUpperCase();

  if (upperCountry === 'IN') {
    // Supplier's home state now comes from CompanyProfile (configurable in
    // Settings) instead of a hardcoded constant, so changing the company's
    // registered state actually affects same-state vs. inter-state GST.
    const profile = await prisma.companyProfile.findFirst({ where: { isActive: true } });
    const supplierState = (profile?.supplierStateCode || DEFAULT_SUPPLIER_STATE).toUpperCase();
    const isSameState = stateCode?.toUpperCase() === supplierState;

    if (isSameState && stateCode) {
      const stateTaxes = await prisma.stateTaxMaster.findMany({
        where: { countryCode: 'IN', stateCode: stateCode.toUpperCase(), isActive: true },
      });
      return resolveTaxRates({
        countryCode: 'IN',
        isSameState: true,
        hasStateCode: true,
        stateTaxRows: stateTaxes.map((t) => ({ taxName: t.taxName, taxType: t.taxType, rate: Number(t.rate) })),
        countryTaxRows: [],
      });
    }

    // Inter-state: IGST. Previously always hardcoded at 18% — now checks
    // CountryTaxMaster first and only falls back to 18% if unconfigured.
    const igstRows = await prisma.countryTaxMaster.findMany({
      where: { countryCode: 'IN', taxType: 'IGST', isActive: true },
    });
    return resolveTaxRates({
      countryCode: 'IN',
      isSameState: false,
      hasStateCode: !!stateCode,
      stateTaxRows: [],
      countryTaxRows: igstRows.map((t) => ({ taxName: t.taxName, taxType: t.taxType, rate: Number(t.defaultRate) })),
    });
  }

  const countryTaxes = await prisma.countryTaxMaster.findMany({
    where: { countryCode: upperCountry, isActive: true },
  });

  let stateTaxRows: TaxRate[] = [];
  if (upperCountry === 'US' && stateCode) {
    const stateTaxes = await prisma.stateTaxMaster.findMany({
      where: { countryCode: 'US', stateCode: stateCode.toUpperCase(), isActive: true },
    });
    stateTaxRows = stateTaxes.map((t) => ({ taxName: t.taxName, taxType: t.taxType, rate: Number(t.rate) }));
  }

  return resolveTaxRates({
    countryCode: upperCountry,
    isSameState: false,
    hasStateCode: !!stateCode,
    stateTaxRows,
    countryTaxRows: countryTaxes.map((t) => ({ taxName: t.taxName, taxType: t.taxType, rate: Number(t.defaultRate) })),
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
