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
// and "only Administrators can override the currency." Non-admins (or any
// admin not passing an override) always get the country's own currency;
// an admin-supplied overrideCurrencyCode only takes effect if it names a
// real, active CurrencyMaster row.
export async function resolveLeadCountryFields(
  countryId: number,
  opts: { isAdmin: boolean; overrideCurrencyCode?: string }
): Promise<ResolvedLeadCountryFields> {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country || !country.isActive) {
    throw new Error('Invalid country selected');
  }

  let currencyCode = country.currencyCode;
  let currencySymbol = country.currencySymbol;

  if (opts.isAdmin && opts.overrideCurrencyCode && opts.overrideCurrencyCode !== country.currencyCode) {
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
