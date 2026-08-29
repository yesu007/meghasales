import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const countryCount = await prisma.country.count();
  const currencyCount = await prisma.currencyMaster.count();
  const rateCount = await prisma.exchangeRate.count();
  console.log('countries:', countryCount, 'currencies:', currencyCount, 'exchangeRates:', rateCount);

  const dupes: any = await prisma.$queryRaw`SELECT currency_code, count(*) c FROM currency_master GROUP BY currency_code HAVING count(*) > 1`;
  console.log('duplicate currency codes:', dupes);

  const sample = await prisma.currencyMaster.findMany({ where: { currencyCode: { in: ['AFN', 'EUR', 'JPY', 'KWD', 'VND', 'ZWG', 'INR', 'USD'] } }, orderBy: { currencyCode: 'asc' } });
  console.log(sample);
}
main().finally(() => prisma.$disconnect());
