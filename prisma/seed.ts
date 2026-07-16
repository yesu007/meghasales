import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  ]);
  console.log(`  ✓ ${roles.length} roles`);

  // Default admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@tekfilo.com' },
    update: {},
    create: { email: 'admin@tekfilo.com', password: hashedPassword, firstName: 'Admin', lastName: 'User', roleId: roles[0].id },
  });
  await prisma.user.upsert({
    where: { email: 'ba@tekfilo.com' },
    update: {},
    create: { email: 'ba@tekfilo.com', password: hashedPassword, firstName: 'BA', lastName: 'User', roleId: roles[2].id },
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
    { currencyCode: 'INR', currencyName: 'Indian Rupee', currencySymbol: '₹', exchangeRateToInr: 1 },
    { currencyCode: 'USD', currencyName: 'US Dollar', currencySymbol: '$', exchangeRateToInr: 83.5 },
    { currencyCode: 'GBP', currencyName: 'British Pound', currencySymbol: '£', exchangeRateToInr: 106 },
    { currencyCode: 'AED', currencyName: 'UAE Dirham', currencySymbol: 'AED', exchangeRateToInr: 22.73 },
    { currencyCode: 'THB', currencyName: 'Thai Baht', currencySymbol: '฿', exchangeRateToInr: 2.35 },
    { currencyCode: 'SGD', currencyName: 'Singapore Dollar', currencySymbol: 'SGD', exchangeRateToInr: 62 },
    { currencyCode: 'SAR', currencyName: 'Saudi Riyal', currencySymbol: 'SAR', exchangeRateToInr: 22.27 },
  ];
  for (const c of currencies) {
    await prisma.currencyMaster.upsert({ where: { currencyCode: c.currencyCode }, update: {}, create: c });
  }
  console.log('  ✓ Currencies seeded');

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
  // country-tax rows seeded above. Deliberately does NOT include every
  // country previously referenced by the old hardcoded quotations-page
  // list (CN/HK/AU/CA/DE/FR/IT) since those never had matching currency/tax
  // data — admins can add them properly via the Country Master UI once
  // real rates are known, rather than seeding guessed values here.
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
  console.log(`  ✓ ${createdCountries.length} countries seeded`);
  const indiaCountry = createdCountries.find((c) => c.isoCode === 'IN')!;

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

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
