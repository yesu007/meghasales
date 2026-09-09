import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { worldCountries } from './data/worldCountries';
import { worldCurrencies } from './data/worldCurrencies';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Roles
  const roles = await Promise.all([
    prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN', description: 'Full system access' } }),
    prisma.role.upsert({ where: { name: 'MANAGEMENT' }, update: {}, create: { name: 'MANAGEMENT', description: 'Strategic oversight' } }),
    prisma.role.upsert({ where: { name: 'BUSINESS_ANALYST' }, update: {}, create: { name: 'BUSINESS_ANALYST', description: 'Lead to implementation' } }),
    prisma.role.upsert({ where: { name: 'DEMO_TEAM' }, update: {}, create: { name: 'DEMO_TEAM', description: 'Demo execution' } }),
    prisma.role.upsert({ where: { name: 'FINANCE' }, update: {}, create: { name: 'FINANCE', description: 'Financial operations' } }),
    prisma.role.upsert({ where: { name: 'DEVOPS' }, update: {}, create: { name: 'DEVOPS', description: 'Infrastructure' } }),
    prisma.role.upsert({ where: { name: 'SALES' }, update: {}, create: { name: 'SALES', description: 'Sales execution — view events, add discussions' } }),
  ]);
  console.log(`  ✓ ${roles.length} roles`);

  // Default users — User<->Role is many-to-many (user_roles), so each seed
  // user gets its role via a nested UserRole create rather than a roleId
  // column. `update: {}` on the user upsert leaves an existing user's roles
  // untouched on re-seed (an admin may have since changed them via the UI).
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@tekfilo.com' },
    update: {},
    create: {
      email: 'admin@tekfilo.com', password: hashedPassword, firstName: 'Admin', lastName: 'User',
      roles: { create: [{ roleId: roles[0].id }] },
    },
  });
  await prisma.user.upsert({
    where: { email: 'ba@tekfilo.com' },
    update: {},
    create: {
      email: 'ba@tekfilo.com', password: hashedPassword, firstName: 'BA', lastName: 'User',
      roles: { create: [{ roleId: roles[2].id }] },
    },
  });
  await prisma.user.upsert({
    where: { email: 'sales@tekfilo.com' },
    update: {},
    create: {
      email: 'sales@tekfilo.com', password: hashedPassword, firstName: 'Sales', lastName: 'User',
      roles: { create: [{ roleId: roles[6].id }] },
    },
  });
  console.log('  ✓ Users seeded');

  // Quotation Module Config
  const modules = [
    { moduleCode: 'TRADING', moduleName: 'Trading ERP', description: 'Complete trading management solution', baseLicenseCost: 250000, additionalUserCost: 5000, additionalBranchCost: 25000, additionalCompanyCost: 50000, implementationCost: 75000, dataMigrationCost: 50000, trainingCost: 20000, cloudHostingCost: 18000, annualMaintenanceCost: 30000, supportCharges: 12000, oneTimeSetupFee: 15000, includedUsers: 5, includedBranches: 1, includedCompanies: 1 },
    { moduleCode: 'JEWELLERY', moduleName: 'Jewellery ERP', description: 'Full jewellery manufacturing and retail ERP', baseLicenseCost: 350000, additionalUserCost: 7000, additionalBranchCost: 30000, additionalCompanyCost: 60000, implementationCost: 100000, dataMigrationCost: 75000, trainingCost: 25000, cloudHostingCost: 24000, annualMaintenanceCost: 45000, supportCharges: 15000, oneTimeSetupFee: 20000, includedUsers: 10, includedBranches: 2, includedCompanies: 1 },
    { moduleCode: 'MANUFACTURING', moduleName: 'Manufacturing ERP', description: 'End-to-end manufacturing management', baseLicenseCost: 400000, additionalUserCost: 8000, additionalBranchCost: 35000, additionalCompanyCost: 70000, implementationCost: 120000, dataMigrationCost: 80000, trainingCost: 30000, cloudHostingCost: 30000, annualMaintenanceCost: 50000, supportCharges: 18000, oneTimeSetupFee: 25000, includedUsers: 15, includedBranches: 3, includedCompanies: 1 },
    { moduleCode: 'ACCOUNTS', moduleName: 'Accounts & Finance', description: 'Comprehensive accounting and financial management', baseLicenseCost: 150000, additionalUserCost: 3000, additionalBranchCost: 15000, additionalCompanyCost: 30000, implementationCost: 40000, dataMigrationCost: 30000, trainingCost: 15000, cloudHostingCost: 12000, annualMaintenanceCost: 20000, supportCharges: 8000, oneTimeSetupFee: 10000, includedUsers: 3, includedBranches: 1, includedCompanies: 1 },
  ];
  for (const m of modules) {
    await prisma.quotationModuleConfig.upsert({ where: { moduleCode: m.moduleCode }, update: {}, create: m });
  }
  console.log('  ✓ Module configs seeded');

  // Add-ons
  const addons = [
    { addonCode: 'MOBILE_APP', addonName: 'Mobile App', description: 'Native mobile application', price: 75000 },
    { addonCode: 'AI_FEATURES', addonName: 'AI Features', description: 'AI-powered analytics', price: 100000 },
    { addonCode: 'WHATSAPP', addonName: 'WhatsApp Integration', description: 'Business WhatsApp API', price: 25000 },
    { addonCode: 'SMS_GATEWAY', addonName: 'SMS Gateway', description: 'Bulk SMS service', price: 15000 },
    { addonCode: 'BARCODE', addonName: 'Barcode Module', description: 'Barcode/QR code support', price: 30000 },
    { addonCode: 'HELPDESK_AI', addonName: 'Help Desk AI', description: 'AI customer support', price: 55000 },
  ];
  for (const a of addons) {
    await prisma.quotationAddonConfig.upsert({ where: { addonCode: a.addonCode }, update: {}, create: a });
  }
  console.log('  ✓ Add-ons seeded');

  // Currencies
  const currencies = [
    { currencyCode: 'INR', currencyName: 'Indian Rupee', currencySymbol: '₹', exchangeRateToInr: 1, isBase: true },
    { currencyCode: 'USD', currencyName: 'US Dollar', currencySymbol: '$', exchangeRateToInr: 83.5 },
    { currencyCode: 'GBP', currencyName: 'British Pound', currencySymbol: '£', exchangeRateToInr: 106 },
    { currencyCode: 'AED', currencyName: 'UAE Dirham', currencySymbol: 'AED', exchangeRateToInr: 22.73 },
    { currencyCode: 'THB', currencyName: 'Thai Baht', currencySymbol: '฿', exchangeRateToInr: 2.35 },
    { currencyCode: 'SGD', currencyName: 'Singapore Dollar', currencySymbol: 'SGD', exchangeRateToInr: 62 },
    { currencyCode: 'SAR', currencyName: 'Saudi Riyal', currencySymbol: 'SAR', exchangeRateToInr: 22.27 },
    { currencyCode: 'CNY', currencyName: 'Chinese Yuan', currencySymbol: '¥', exchangeRateToInr: 11.6 },
    { currencyCode: 'HKD', currencyName: 'Hong Kong Dollar', currencySymbol: '$', exchangeRateToInr: 10.71 },
  ];
  for (const c of currencies) {
    // update only isBase (not the rate/name/symbol) — an existing row's rate
    // is left alone since it may have been changed since seeding, but isBase
    // is new and must be (re)asserted even on a DB that already has this row.
    await prisma.currencyMaster.upsert({
      where: { currencyCode: c.currencyCode },
      update: { isBase: c.isBase ?? false },
      create: c,
    });
  }
  console.log('  ✓ Currencies seeded');

  // Exchange rate history backfill — one MANUAL row per non-base currency,
  // matching CurrencyMaster's current exchangeRateToInr so the history table
  // isn't empty on a fresh DB. Fixed seed date (not "today") so re-running
  // seed against the same DB stays idempotent via the upsert key below.
  const EXCHANGE_RATE_SEED_DATE = new Date('2026-07-31');
  for (const c of currencies) {
    if (c.currencyCode === 'INR') continue;
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
        source: 'manual',
      },
    });
  }
  console.log('  ✓ Exchange rate history backfilled');

  // Rest-of-world currencies — CurrencyMaster previously only had the 9
  // currencies above, which meant the "Override currency (Administrator
  // only)" select on the Lead form (and the Country Master's own Currency
  // select) couldn't offer any currency outside that list, even though the
  // countries table now covers all 197 ISO countries. `update: {}` so this
  // never clobbers a rate an admin has since corrected via the Currency
  // Master UI.
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
  console.log(`  ✓ ${worldCurrencies.length} more currencies seeded (rest of world)`);

  // Country taxes
  const countryTaxes = [
    { countryCode: 'IN', countryName: 'India', taxName: 'GST', taxType: 'GST', defaultRate: 18, currencyCode: 'INR' },
    { countryCode: 'IN', countryName: 'India', taxName: 'CGST', taxType: 'CGST', defaultRate: 9, currencyCode: 'INR' },
    { countryCode: 'IN', countryName: 'India', taxName: 'SGST', taxType: 'SGST', defaultRate: 9, currencyCode: 'INR' },
    { countryCode: 'IN', countryName: 'India', taxName: 'IGST', taxType: 'IGST', defaultRate: 18, currencyCode: 'INR' },
    { countryCode: 'AE', countryName: 'UAE', taxName: 'VAT', taxType: 'VAT', defaultRate: 5, currencyCode: 'AED' },
    { countryCode: 'US', countryName: 'United States', taxName: 'Sales Tax', taxType: 'SALES_TAX', defaultRate: 0, currencyCode: 'USD' },
    { countryCode: 'TH', countryName: 'Thailand', taxName: 'VAT', taxType: 'VAT', defaultRate: 7, currencyCode: 'THB' },
    { countryCode: 'GB', countryName: 'United Kingdom', taxName: 'VAT', taxType: 'VAT', defaultRate: 20, currencyCode: 'GBP' },
    { countryCode: 'SG', countryName: 'Singapore', taxName: 'GST', taxType: 'GST', defaultRate: 9, currencyCode: 'SGD' },
    { countryCode: 'SA', countryName: 'Saudi Arabia', taxName: 'VAT', taxType: 'VAT', defaultRate: 15, currencyCode: 'SAR' },
  ];
  for (const t of countryTaxes) {
    await prisma.countryTaxMaster.upsert({
      where: { countryCode_taxName_effectiveFrom: { countryCode: t.countryCode, taxName: t.taxName, effectiveFrom: new Date('2017-07-01') } },
      update: {},
      create: { ...t, effectiveFrom: new Date('2017-07-01') },
    });
  }
  console.log('  ✓ Country taxes seeded');

  // Indian states
  const indianStates = ['TN:Tamil Nadu', 'KA:Karnataka', 'MH:Maharashtra', 'KL:Kerala', 'DL:Delhi', 'GJ:Gujarat', 'RJ:Rajasthan', 'UP:Uttar Pradesh', 'WB:West Bengal', 'AP:Andhra Pradesh', 'TS:Telangana', 'PB:Punjab', 'HR:Haryana', 'MP:Madhya Pradesh', 'BR:Bihar'];
  for (const s of indianStates) {
    const [code, name] = s.split(':');
    for (const taxType of ['SGST', 'CGST']) {
      await prisma.stateTaxMaster.upsert({
        where: { countryCode_stateCode_taxName_effectiveFrom: { countryCode: 'IN', stateCode: code, taxName: taxType, effectiveFrom: new Date('2017-07-01') } },
        update: {},
        create: { countryCode: 'IN', stateCode: code, stateName: name, taxName: taxType, taxType, rate: 9, effectiveFrom: new Date('2017-07-01') },
      });
    }
  }
  console.log('  ✓ State taxes seeded');

  // Countries — canonical picklist/defaults, backed 1:1 by the currency and
  // country-tax rows seeded above for the handful with a real, known tax
  // rate. These are seeded first so the full-world merge below never
  // overwrites their `defaultTaxType`/`defaultTaxPercentage` (upsert `update`
  // is `{}` in both loops — a country row, once created, keeps whatever tax
  // fields it was created with; admins can still edit any of them later via
  // the Country Master UI).
  const countries = [
    { countryName: 'India', isoCode: 'IN', currencyCode: 'INR', currencyName: 'Indian Rupee', currencySymbol: '₹', defaultTaxType: 'GST', defaultTaxPercentage: 18, flagEmoji: '🇮🇳' },
    { countryName: 'United States', isoCode: 'US', currencyCode: 'USD', currencyName: 'US Dollar', currencySymbol: '$', defaultTaxType: 'NONE', defaultTaxPercentage: 0, flagEmoji: '🇺🇸' },
    { countryName: 'United Arab Emirates', isoCode: 'AE', currencyCode: 'AED', currencyName: 'UAE Dirham', currencySymbol: 'AED', defaultTaxType: 'VAT', defaultTaxPercentage: 5, flagEmoji: '🇦🇪' },
    { countryName: 'Thailand', isoCode: 'TH', currencyCode: 'THB', currencyName: 'Thai Baht', currencySymbol: '฿', defaultTaxType: 'VAT', defaultTaxPercentage: 7, flagEmoji: '🇹🇭' },
    { countryName: 'United Kingdom', isoCode: 'GB', currencyCode: 'GBP', currencyName: 'British Pound', currencySymbol: '£', defaultTaxType: 'VAT', defaultTaxPercentage: 20, flagEmoji: '🇬🇧' },
    { countryName: 'Singapore', isoCode: 'SG', currencyCode: 'SGD', currencyName: 'Singapore Dollar', currencySymbol: 'SGD', defaultTaxType: 'GST', defaultTaxPercentage: 9, flagEmoji: '🇸🇬' },
    { countryName: 'Saudi Arabia', isoCode: 'SA', currencyCode: 'SAR', currencyName: 'Saudi Riyal', currencySymbol: 'SAR', defaultTaxType: 'VAT', defaultTaxPercentage: 15, flagEmoji: '🇸🇦' },
  ];
  const createdCountries = await Promise.all(
    countries.map((c) => prisma.country.upsert({ where: { isoCode: c.isoCode }, update: {}, create: c }))
  );
  console.log(`  ✓ ${createdCountries.length} countries seeded (known tax rates)`);
  const indiaCountry = createdCountries.find((c) => c.isoCode === 'IN')!;

  // Full ISO 3166-1 country list — makes CountrySelect's type-search combobox
  // (src/components/CountrySelect.tsx, used on Lead Add, Quotations, and
  // Settings → Regional) cover every country in the world, not just the 7
  // above with a hand-verified tax rate. These get `defaultTaxType: 'NONE'` /
  // `defaultTaxPercentage: 0` since their real rates aren't verified here —
  // same "don't seed guessed tax data" principle as before, just no longer
  // used as a reason to omit the country from the picklist entirely. Skips
  // any isoCode already created above so their real tax rates are untouched.
  const knownIsoCodes = new Set(countries.map((c) => c.isoCode));
  const flagEmojiFromIso = (isoCode: string) =>
    String.fromCodePoint(...Array.from(isoCode.toUpperCase()).map((ch) => 127397 + ch.charCodeAt(0)));
  const restOfWorldCountries = worldCountries
    .filter((c) => !knownIsoCodes.has(c.isoCode))
    .map((c) => ({ ...c, defaultTaxType: 'NONE', defaultTaxPercentage: 0, flagEmoji: flagEmojiFromIso(c.isoCode) }));
  const createdRestOfWorld = await Promise.all(
    restOfWorldCountries.map((c) => prisma.country.upsert({ where: { isoCode: c.isoCode }, update: {}, create: c }))
  );
  console.log(`  ✓ ${createdRestOfWorld.length} more countries seeded (rest of world)`);

  // Company Profile
  const companyProfile = await prisma.companyProfile.upsert({
    where: { id: 1 },
    update: {},
    create: {
      companyName: 'Tekfilo',
      tagline: 'Empowering Businesses with Smart Technology Solutions',
      addressLine1: '4th Floor, Tech Park',
      city: 'Chennai', state: 'Tamil Nadu', country: 'India', postalCode: '600001',
      phone: '+91 98765 43210', email: 'sales@tekfilo.com', website: 'https://www.tekfilo.com',
      termsAndConditions: '1. This quotation is valid for 30 days.\n2. Prices exclude applicable taxes unless stated.\n3. Payment terms as specified.\n4. Delivery subject to timely approvals.',
      paymentTerms: '50% Advance upon confirmation\n30% upon UAT completion\n20% upon Go-Live',
      warrantyTerms: '90 days warranty from Go-Live date',
      supplierStateCode: 'TN',
      defaultCountryId: indiaCountry.id,
    },
  });
  if (!companyProfile.defaultCountryId) {
    await prisma.companyProfile.update({ where: { id: companyProfile.id }, data: { defaultCountryId: indiaCountry.id } });
  }
  console.log('  ✓ Company profile seeded');

  // Accounting permissions
  const accountingPermissions = [
    { name: 'view_accounting', description: 'View accounting module data', module: 'ACCOUNTING' },
    { name: 'manage_invoices', description: 'Create/edit/delete invoices', module: 'ACCOUNTING' },
    { name: 'manage_payments', description: 'Record/edit/delete payments', module: 'ACCOUNTING' },
  ];
  const createdPermissions = await Promise.all(
    accountingPermissions.map((p) => prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p }))
  );
  console.log('  ✓ Accounting permissions seeded');

  // Grant accounting permissions to the roles that should have them —
  // RolePermission had zero rows for ANY module before this (the RBAC
  // schema existed but was never actually used anywhere in the app), so
  // this is the first real grant, not a re-grant. ADMIN/MANAGEMENT/FINANCE
  // get full accounting access; other roles (BA, Demo Team, DevOps) don't,
  // by design — they have no reason to touch invoicing.
  const accountingRoles = [roles[0], roles[1], roles[4]]; // ADMIN, MANAGEMENT, FINANCE
  for (const role of accountingRoles) {
    for (const permission of createdPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log('  ✓ Accounting permissions granted to ADMIN, MANAGEMENT, FINANCE roles');

  // Country Master / settings permission — ADMIN gets it explicitly here as
  // a belt-and-suspenders grant alongside requirePermission()'s implicit
  // ADMIN bypass, matching how accounting permissions above are handled.
  const manageCountriesPermission = await prisma.permission.upsert({
    where: { name: 'manage_countries' },
    update: {},
    create: { name: 'manage_countries', description: 'Add/edit countries and default currency/tax mapping', module: 'SETTINGS' },
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roles[0].id, permissionId: manageCountriesPermission.id } },
    update: {},
    create: { roleId: roles[0].id, permissionId: manageCountriesPermission.id },
  });
  console.log('  ✓ manage_countries permission seeded and granted to ADMIN');

  // Email (Zoho SMTP) settings permission — same belt-and-suspenders
  // pattern as manage_countries above.
  const manageEmailSettingsPermission = await prisma.permission.upsert({
    where: { name: 'manage_email_settings' },
    update: {},
    create: { name: 'manage_email_settings', description: 'Configure the outbound SMTP (Zoho Mail) settings used for deadline-reminder emails', module: 'SETTINGS' },
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roles[0].id, permissionId: manageEmailSettingsPermission.id } },
    update: {},
    create: { roleId: roles[0].id, permissionId: manageEmailSettingsPermission.id },
  });
  console.log('  ✓ manage_email_settings permission seeded and granted to ADMIN');

  // Lead Events permissions — Event Management feature (Events/Documents/
  // Discussions on a CONFIRMED lead). ADMIN gets all three explicitly
  // (belt-and-suspenders alongside requirePermission()'s ADMIN bypass);
  // BUSINESS_ANALYST gets full manage access; SALES (new role) gets
  // view + add-discussion only; MANAGEMENT gets read-only view.
  const eventPermissions = [
    { name: 'view_lead_events', description: 'View events, documents, and discussions on a lead', module: 'LEAD_EVENTS' },
    { name: 'manage_lead_events', description: 'Create/edit/delete events, documents, and discussions on a lead', module: 'LEAD_EVENTS' },
    { name: 'add_lead_discussion', description: "Add discussions to a lead's events (without event/document CRUD)", module: 'LEAD_EVENTS' },
  ];
  const createdEventPermissions = await Promise.all(
    eventPermissions.map((p) => prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p }))
  );
  const byName = (name: string) => createdEventPermissions.find((p) => p.name === name)!;
  const eventGrants: Array<[typeof roles[number], typeof createdEventPermissions]> = [
    [roles[0], createdEventPermissions], // ADMIN — all
    [roles[2], [byName('view_lead_events'), byName('manage_lead_events')]], // BUSINESS_ANALYST
    [roles[6], [byName('view_lead_events'), byName('add_lead_discussion')]], // SALES
    [roles[1], [byName('view_lead_events')]], // MANAGEMENT — read-only
  ];
  for (const [role, perms] of eventGrants) {
    for (const permission of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log('  ✓ Lead Events permissions granted to ADMIN, BUSINESS_ANALYST, SALES, MANAGEMENT');

  // Lead read permission — core Lead/Demo data had zero granular permissions
  // before this (only the LEAD_EVENTS sub-feature above was ever gated); this
  // is the first grant for the underlying lead records themselves, added for
  // the voice assistant's read-only tools (src/lib/assistant/tools) so they
  // aren't left ungated just because the equivalent REST routes are.
  const viewLeadsPermission = await prisma.permission.upsert({
    where: { name: 'view_leads' },
    update: {},
    create: { name: 'view_leads', description: 'View lead, demo, and dashboard summary data', module: 'LEADS' },
  });
  for (const role of [roles[0], roles[1], roles[2], roles[3], roles[6]]) {
    // ADMIN, MANAGEMENT, BUSINESS_ANALYST, DEMO_TEAM, SALES
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: viewLeadsPermission.id } },
      update: {},
      create: { roleId: role.id, permissionId: viewLeadsPermission.id },
    });
  }
  console.log('  ✓ view_leads permission seeded and granted to ADMIN, MANAGEMENT, BUSINESS_ANALYST, DEMO_TEAM, SALES');

  // Default reminder templates (one per threshold, email + WhatsApp variants)
  const reminderThresholds = [
    { type: 'UPCOMING_7D', label: 'Payment Due in 7 Days' },
    { type: 'DUE_TODAY', label: 'Payment Due Today' },
    { type: 'OVERDUE_3D', label: 'Payment Overdue by 3 Days' },
    { type: 'OVERDUE_7D', label: 'Payment Overdue by 7 Days' },
    { type: 'OVERDUE_15D', label: 'Payment Overdue by 15 Days' },
    { type: 'OVERDUE_30D', label: 'Payment Overdue by 30+ Days' },
  ];
  for (const t of reminderThresholds) {
    for (const channel of ['EMAIL', 'WHATSAPP']) {
      const name = `${t.label} (${channel === 'EMAIL' ? 'Email' : 'WhatsApp'})`;
      const existing = await prisma.reminderTemplate.findFirst({ where: { reminderType: t.type, channel } });
      if (!existing) {
        await prisma.reminderTemplate.create({
          data: {
            name,
            reminderType: t.type,
            channel,
            subject: channel === 'EMAIL' ? `${t.label} - Invoice {{invoiceNumber}}` : null,
            body: `Dear {{customerName}}, this is a reminder that invoice {{invoiceNumber}} for {{amountDue}} was due on {{dueDate}}. Please arrange payment at your earliest convenience.`,
          },
        });
      }
    }
  }
  console.log('  ✓ Reminder templates seeded');

  // Admin Ticket module permissions — feature-flagged (FEATURE_ADMIN_TICKET),
  // fully additive office-admin task tracker. ADMIN gets both explicitly
  // (belt-and-suspenders alongside requirePermission()'s ADMIN bypass);
  // DEVOPS (closest existing role to "office admin"/facilities duties) gets
  // full manage access; MANAGEMENT gets read-only view for oversight.
  const adminTicketPermissions = [
    { name: 'view_admin_tickets', description: 'View admin tickets, categories, and activity', module: 'ADMIN_TICKET' },
    { name: 'manage_admin_tickets', description: 'Create/edit/complete admin tickets and categories', module: 'ADMIN_TICKET' },
  ];
  const createdAdminTicketPermissions = await Promise.all(
    adminTicketPermissions.map((p) => prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p }))
  );
  const byAdminTicketName = (name: string) => createdAdminTicketPermissions.find((p) => p.name === name)!;
  const adminTicketGrants: Array<[typeof roles[number], typeof createdAdminTicketPermissions]> = [
    [roles[0], createdAdminTicketPermissions], // ADMIN — all
    [roles[5], createdAdminTicketPermissions], // DEVOPS — all
    [roles[1], [byAdminTicketName('view_admin_tickets')]], // MANAGEMENT — read-only
  ];
  for (const [role, perms] of adminTicketGrants) {
    for (const permission of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log('  ✓ Admin Ticket permissions granted to ADMIN, DEVOPS, MANAGEMENT');

  // Starter categories matching the common office-admin obligation types —
  // upsert by code so re-seeding never duplicates or clobbers edits made
  // later through the UI.
  const adminTicketCategories = [
    { code: 'STATUTORY', name: 'Statutory / Compliance', defaultPriority: 'HIGH', defaultSlaDays: 30 },
    { code: 'CONTRACTS', name: 'Contracts & Renewals', defaultPriority: 'MEDIUM', defaultSlaDays: 30 },
    { code: 'ASSETS', name: 'Assets & Facilities', defaultPriority: 'MEDIUM', defaultSlaDays: 14 },
    { code: 'VENDOR_FINANCE', name: 'Vendor & Finance', defaultPriority: 'MEDIUM', defaultSlaDays: 7 },
    { code: 'HR_ADMIN', name: 'HR / Staff Admin', defaultPriority: 'MEDIUM', defaultSlaDays: 14 },
    { code: 'AD_HOC', name: 'Ad-hoc', defaultPriority: 'LOW', defaultSlaDays: 7 },
  ];
  for (const c of adminTicketCategories) {
    await prisma.adminTicketCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  console.log('  ✓ Admin Ticket categories seeded');

  // Payroll module permissions — feature-flagged (FEATURE_PAYROLL), Phase 0
  // of the payroll plan. Full grant to ADMIN/MANAGEMENT/FINANCE, mirroring
  // the Accounting grant above exactly (same three roles, no read-only
  // split, no new role) rather than Admin Ticket's ADMIN/DEVOPS-manage +
  // MANAGEMENT-view-only pattern.
  const payrollPermissions = [
    { name: 'view_payroll', description: 'View employee payroll profiles, salary structures, and payroll runs', module: 'PAYROLL' },
    { name: 'manage_employees', description: 'Create/edit employee HR and payroll profiles', module: 'PAYROLL' },
    { name: 'manage_salary_structures', description: 'Create/edit salary components, structures, and employee assignments', module: 'PAYROLL' },
    { name: 'run_payroll', description: 'Generate and edit a draft payroll run', module: 'PAYROLL' },
    { name: 'approve_payroll', description: 'Approve, process, and mark a payroll run as paid', module: 'PAYROLL' },
  ];
  const createdPayrollPermissions = await Promise.all(
    payrollPermissions.map((p) => prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p }))
  );
  const payrollRoles = [roles[0], roles[1], roles[4]]; // ADMIN, MANAGEMENT, FINANCE
  for (const role of payrollRoles) {
    for (const permission of createdPayrollPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log('  ✓ Payroll permissions granted to ADMIN, MANAGEMENT, FINANCE roles');

  // Payroll Phase 4 — starting Tamil Nadu PT slabs (commonly-cited
  // monthly-equivalent figures, NOT verified against a current government
  // notification — editable via /dashboard/payroll/statutory). Only seeded
  // if no TN slabs exist yet, so re-running this script never duplicates
  // or clobbers rates someone has since edited through the UI.
  const existingTnSlabs = await prisma.ptSlab.count({ where: { state: 'TN' } });
  if (existingTnSlabs === 0) {
    await prisma.ptSlab.createMany({
      data: [
        { state: 'TN', minGross: 0, maxGross: 21000, monthlyAmount: 0 },
        { state: 'TN', minGross: 21001, maxGross: 30000, monthlyAmount: 135 },
        { state: 'TN', minGross: 30001, maxGross: 45000, monthlyAmount: 315 },
        { state: 'TN', minGross: 45001, maxGross: 60000, monthlyAmount: 690 },
        { state: 'TN', minGross: 60001, maxGross: 75000, monthlyAmount: 1025 },
        { state: 'TN', minGross: 75001, maxGross: null, monthlyAmount: 1250 },
      ],
    });
    console.log('  ✓ Tamil Nadu PT slabs seeded');
  }

  // Payroll Phase 5 (Attendance & Leave) — approve_leave permission,
  // granted to the same three roles as every other payroll permission.
  const approveLeavePermission = await prisma.permission.upsert({
    where: { name: 'approve_leave' },
    update: {},
    create: { name: 'approve_leave', description: 'Approve or reject employee leave requests', module: 'PAYROLL' },
  });
  for (const role of payrollRoles) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: approveLeavePermission.id } },
      update: {},
      create: { roleId: role.id, permissionId: approveLeavePermission.id },
    });
  }
  console.log('  ✓ approve_leave permission granted to ADMIN, MANAGEMENT, FINANCE roles');

  // Starter leave types — upsert by code so re-seeding never duplicates.
  const leaveTypes = [
    { name: 'Casual Leave', code: 'CASUAL', isPaid: true, annualQuota: 12 },
    { name: 'Sick Leave', code: 'SICK', isPaid: true, annualQuota: 12 },
    { name: 'Earned Leave', code: 'EARNED', isPaid: true, annualQuota: 15 },
    { name: 'Loss of Pay', code: 'LOP', isPaid: false, annualQuota: null },
  ];
  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({ where: { code: lt.code }, update: {}, create: lt });
  }
  console.log('  ✓ Leave types seeded');

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
