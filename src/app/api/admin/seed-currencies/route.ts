import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { worldCurrencies } from '../../../../../prisma/data/worldCurrencies';

export const dynamic = 'force-dynamic';

// TEMPORARY one-shot endpoint — mirrors the "rest of world" currency +
// exchange-rate upsert in prisma/seed.ts, for environments (like prod here)
// where `npx prisma db seed` can't be run directly against DATABASE_URL.
// Safe to re-run: uses upsert with `update: {}` throughout, so it never
// overwrites a rate an admin has since corrected via Currency Master.
// Delete this route once prod has been seeded.
const EXCHANGE_RATE_SEED_DATE = new Date('2026-07-31');

export async function POST() {
  const denied = await requirePermission('manage_countries');
  if (denied) return denied;

  try {
    const beforeCurrencies = await prisma.currencyMaster.count();
    const beforeRates = await prisma.exchangeRate.count();

    for (const c of worldCurrencies) {
      await prisma.currencyMaster.upsert({
        where: { currencyCode: c.currencyCode },
        update: {},
        create: { currencyCode: c.currencyCode, currencyName: c.currencyName, currencySymbol: c.currencySymbol, exchangeRateToInr: c.exchangeRateToInr },
      });
      await prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency_rateDate_rateType: {
            fromCurrency: c.currencyCode,
            toCurrency: 'INR',
            rateDate: EXCHANGE_RATE_SEED_DATE,
            rateType: 'MANUAL',
          },
        },
        update: {},
        create: {
          fromCurrency: c.currencyCode,
          toCurrency: 'INR',
          rate: c.exchangeRateToInr,
          rateDate: EXCHANGE_RATE_SEED_DATE,
          rateType: 'MANUAL',
          source: 'manual (approximate — refine via Currency Master)',
        },
      });
    }

    const afterCurrencies = await prisma.currencyMaster.count();
    const afterRates = await prisma.exchangeRate.count();

    return NextResponse.json({
      message: 'Currency master + exchange rates seeded',
      currenciesBefore: beforeCurrencies,
      currenciesAfter: afterCurrencies,
      ratesBefore: beforeRates,
      ratesAfter: afterRates,
      totalUpserted: worldCurrencies.length,
    });
  } catch (error: any) {
    console.error('POST /api/admin/seed-currencies error:', error);
    return NextResponse.json({ message: error.message || 'Failed to seed currencies' }, { status: 500 });
  }
}
