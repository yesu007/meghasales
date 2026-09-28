import prisma from '@/lib/prisma';

export interface ResolvedLeadCountryFields {
  countryId: number;
  country: string;
  currencyCode: string;
  currencySymbol: string;
  taxType: string;
}

// Server-side resolution of a Lead's country/currency/tax fields — the
// enforcement point for "currency must always match the selected country"
// and "only roles with override_currency can override the currency."
// Everyone else (or anyone not passing an override) always gets the
// country's own currency; a permitted overrideCurrencyCode only takes effect
// if it names a real, active CurrencyMaster row.
export async function resolveLeadCountryFields(
  countryId: number,
  opts: { canOverrideCurrency: boolean; overrideCurrencyCode?: string }
): Promise<ResolvedLeadCountryFields> {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country || !country.isActive) {
    throw new Error('Invalid country selected');
  }

  let currencyCode = country.currencyCode;
  let currencySymbol = country.currencySymbol;

  if (opts.canOverrideCurrency && opts.overrideCurrencyCode && opts.overrideCurrencyCode !== country.currencyCode) {
    const currency = await prisma.currencyMaster.findUnique({ where: { currencyCode: opts.overrideCurrencyCode } });
    if (currency && currency.isActive) {
      currencyCode = currency.currencyCode;
      currencySymbol = currency.currencySymbol;
    }
  }

  return {
    countryId: country.id,
    country: country.countryName,
    currencyCode,
    currencySymbol,
    taxType: country.defaultTaxType,
  };
}
