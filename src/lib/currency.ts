import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;

// BCP-47 locale used purely for digit-grouping style (e.g. India's
// lakh/crore grouping vs. thousands grouping elsewhere) — not tied to the
// symbol, which is always supplied/looked up separately.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  AED: 'en-AE',
  THB: 'th-TH',
  SGD: 'en-SG',
  SAR: 'en-SA',
};

export function localeForCurrency(currencyCode: string): string {
  return LOCALE_BY_CURRENCY[currencyCode?.toUpperCase()] || 'en-US';
}

// Default symbols for every currently-seeded CurrencyMaster row, used when
// a caller doesn't pass one explicitly (e.g. anywhere formatting a raw
// currencyCode field straight from the database, without a joined
// CurrencyMaster/Country row on hand). Kept in sync with prisma/seed.ts's
// `currencies` list. Unknown codes fall back to the code itself.
const SYMBOL_BY_CURRENCY: Record<string, string> = {
  INR: '₹',
  USD: '$',
  GBP: '£',
  AED: 'AED',
  THB: '฿',
  SGD: 'SGD',
  SAR: 'SAR',
};

export function symbolForCurrency(currencyCode: string): string {
  return SYMBOL_BY_CURRENCY[currencyCode?.toUpperCase()] || currencyCode || '';
}

export interface FormatCurrencyOptions {
  symbol?: string;
  decimalPlaces?: number;
}

// Pure, unit-testable: formats a monetary amount with the correct digit
// grouping for its currency (instead of always assuming en-IN) and its
// symbol (single-glyph symbols like ₹/$/£ are prefixed directly; longer
// ISO-style symbols like AED/SGD/SAR get a separating space).
export function formatCurrency(amount: number | string | Decimal, currencyCode: string, opts: FormatCurrencyOptions = {}): string {
  const value = new Decimal(amount ?? 0).toNumber();
  const decimalPlaces = opts.decimalPlaces ?? 2;
  const locale = localeForCurrency(currencyCode);
  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);

  const symbol = opts.symbol ?? symbolForCurrency(currencyCode);
  const separator = symbol.length > 1 ? ' ' : '';
  return `${symbol}${separator}${formattedNumber}`;
}
