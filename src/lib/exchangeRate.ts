import prisma from '@/lib/prisma';

export class RateNotFoundError extends Error {
  constructor(message = 'No exchange rate found for the requested currency pair and date') {
    super(message);
    this.name = 'RateNotFoundError';
  }
}

export interface RateRow {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateDate: string; // ISO date (YYYY-MM-DD)
}

// Pure rate-selection logic, split out of getExchangeRate() so it's testable
// without a database. `candidates` may contain rows for either direction of
// the (from, to) pair — the caller doesn't pre-filter direction.
//
// Picks the most recent row on or before onDate in the direct (from -> to)
// direction; if none exists, falls back to the most recent inverse
// (to -> from) row, inverted. Rows are unique per (from, to, date, type), so
// an exact match on onDate is simply the max date <= onDate — no separate
// "exact match" branch is needed. Returns null (never a default of 1) when
// nothing applies; the caller decides whether that's a hard error.
export function resolveExchangeRate(candidates: RateRow[], from: string, to: string, onDate: string): number | null {
  if (from === to) return 1;

  const eligible = candidates.filter((r) => r.rateDate <= onDate);

  const direct = mostRecent(eligible.filter((r) => r.fromCurrency === from && r.toCurrency === to));
  if (direct) return direct.rate;

  const inverse = mostRecent(eligible.filter((r) => r.fromCurrency === to && r.toCurrency === from));
  if (inverse) return 1 / inverse.rate;

  return null;
}

function mostRecent(rows: RateRow[]): RateRow | null {
  return rows.reduce<RateRow | null>((latest, r) => (!latest || r.rateDate > latest.rateDate ? r : latest), null);
}

async function fetchCandidateRows(from: string, to: string, rateType: string, onDate: string): Promise<RateRow[]> {
  const rows = await prisma.exchangeRate.findMany({
    where: {
      rateType,
      rateDate: { lte: new Date(onDate) },
      OR: [
        { fromCurrency: from, toCurrency: to },
        { fromCurrency: to, toCurrency: from },
      ],
    },
  });

  return rows.map((r) => ({
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: Number(r.rate),
    rateDate: r.rateDate.toISOString().slice(0, 10),
  }));
}

// Resolves the applicable exchange rate for (from, to) on onDate. Tries a
// direct/inverse lookup first, then triangulates via the configured base
// currency (each leg queried in both directions, since history rows only
// exist one direction per currency, e.g. USD->INR but never INR->USD).
// Throws RateNotFoundError rather than defaulting to 1 when nothing resolves
// — a missing rate is a business exception a human must resolve, not a
// silent no-op.
export async function getExchangeRate(from: string, to: string, onDate: string, rateType: string): Promise<number> {
  if (from === to) return 1;

  const direct = resolveExchangeRate(await fetchCandidateRows(from, to, rateType, onDate), from, to, onDate);
  if (direct !== null) return direct;

  const base = await prisma.currencyMaster.findFirst({ where: { isBase: true } });
  if (!base) {
    throw new RateNotFoundError(`No exchange rate found for ${from} -> ${to} on or before ${onDate}, and no base currency is configured`);
  }

  const fromToBase = resolveExchangeRate(
    await fetchCandidateRows(from, base.currencyCode, rateType, onDate),
    from,
    base.currencyCode,
    onDate,
  );
  const baseToTo = resolveExchangeRate(
    await fetchCandidateRows(base.currencyCode, to, rateType, onDate),
    base.currencyCode,
    to,
    onDate,
  );

  if (fromToBase !== null && baseToTo !== null) return fromToBase * baseToTo;

  throw new RateNotFoundError(`No exchange rate found for ${from} -> ${to} on or before ${onDate}`);
}
