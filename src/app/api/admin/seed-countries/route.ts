import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { worldCountries } from '../../../../../prisma/data/worldCountries';

export const dynamic = 'force-dynamic';

// TEMPORARY one-shot endpoint — mirrors the "rest of world" country upsert in
// prisma/seed.ts, for environments (like prod here) where `npx prisma db
// seed` can't be run directly against DATABASE_URL. Safe to re-run: uses
// upsert with `update: {}`, so it never touches a country row that already
// exists (in particular it won't overwrite the 7 rows that carry a real
// GST/VAT rate). Delete this route once prod has been seeded.
const flagEmojiFromIso = (isoCode: string) =>
  String.fromCodePoint(...Array.from(isoCode.toUpperCase()).map((ch) => 127397 + ch.charCodeAt(0)));

export async function POST() {
  const denied = await requirePermission('manage_countries');
  if (denied) return denied;

  try {
    const before = await prisma.country.count();

    const results = await Promise.all(
      worldCountries.map((c) =>
        prisma.country.upsert({
          where: { isoCode: c.isoCode },
          update: {},
          create: {
            countryName: c.countryName,
            isoCode: c.isoCode,
            currencyCode: c.currencyCode,
            currencyName: c.currencyName,
            currencySymbol: c.currencySymbol,
            defaultTaxType: 'NONE',
            defaultTaxPercentage: 0,
            flagEmoji: flagEmojiFromIso(c.isoCode),
          },
        })
      )
    );

    const after = await prisma.country.count();

    return NextResponse.json({
      message: 'Country picklist seeded',
      countBefore: before,
      countAfter: after,
      created: after - before,
      totalUpserted: results.length,
    });
  } catch (error: any) {
    console.error('POST /api/admin/seed-countries error:', error);
    return NextResponse.json({ message: error.message || 'Failed to seed countries' }, { status: 500 });
  }
}
