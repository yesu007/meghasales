import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { resolveCustomerCountryFields } from '@/lib/customerCountry';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Customer-owned create endpoint. There is no separate Customer table —
// "Customer" is a Lead row with status = CONFIRMED (see the module note in
// src/app/dashboard/customers/page.tsx) — so this still writes to the Lead
// table, but keeps its own validation/permission/audit handling here rather
// than calling into src/app/api/leads/route.ts, so Customer creation never
// depends on Lead's own request handling.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.companyName) {
      return NextResponse.json({ message: 'Company name is required' }, { status: 400 });
    }
    if (!body.contactPerson) {
      return NextResponse.json({ message: 'Contact person is required' }, { status: 400 });
    }
    if (!body.mobile) {
      return NextResponse.json({ message: 'Mobile is required' }, { status: 400 });
    }
    if (!body.leadSource) {
      return NextResponse.json({ message: 'Source is required' }, { status: 400 });
    }
    if (!body.businessVerticals) {
      return NextResponse.json({ message: 'Business vertical is required' }, { status: 400 });
    }
    if (!body.countryId) {
      return NextResponse.json({ message: 'Country is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user?.roles || []).includes('ADMIN');
    let countryFields;
    try {
      countryFields = await resolveCustomerCountryFields(parseInt(body.countryId), { isAdmin, overrideCurrencyCode: body.currencyCode });
    } catch (e: any) {
      return NextResponse.json({ message: e.message || 'Invalid country selected' }, { status: 400 });
    }

    // Find-or-create the Customer Company Master by exact (case-insensitive)
    // name match, then find-or-create its legal entity for the selected
    // country. This is what makes "one company, several country
    // registrations" happen naturally from this same form: creating a
    // second customer named "Tekfilo" with Hong Kong selected locates the
    // existing "Tekfilo" company and adds a Hong Kong entity under it,
    // rather than a disconnected duplicate. Address/tax fields are
    // optional; documents can't attach until the entity exists, so those
    // are added afterward from the customer's own Company tab.
    const trimmedCompanyName = String(body.companyName).trim();
    let company = await prisma.company.findFirst({ where: { name: { equals: trimmedCompanyName, mode: 'insensitive' } } });
    if (!company) {
      const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;
      company = await prisma.company.create({ data: { name: trimmedCompanyName, createdById: Number.isFinite(createdById) ? createdById : null } });
    }

    let legalEntity = await prisma.companyLegalEntity.findUnique({ where: { companyId_countryId: { companyId: company.id, countryId: countryFields.countryId } } });
    if (!legalEntity) {
      legalEntity = await prisma.companyLegalEntity.create({
        data: {
          companyId: company.id,
          countryId: countryFields.countryId,
          legalName: body.legalName ? String(body.legalName).trim() : trimmedCompanyName,
          taxRegistrationNumber: body.taxRegistrationNumber || null,
          addressLine1: body.addressLine1 || null,
          addressLine2: body.addressLine2 || null,
          city: body.city || null,
          state: body.state || null,
          postalCode: body.postalCode || null,
          currencyCode: countryFields.currencyCode,
        },
      });
    }

    const customer = await prisma.lead.create({
      data: {
        companyName: body.companyName,
        contactPerson: body.contactPerson,
        mobile: body.mobile || null,
        email: body.email || null,
        country: countryFields.country,
        countryId: countryFields.countryId,
        currencyCode: countryFields.currencyCode,
        currencySymbol: countryFields.currencySymbol,
        taxType: countryFields.taxType,
        state: body.state || null,
        city: body.city || null,
        leadSource: body.leadSource,
        businessVerticals: body.businessVerticals ? JSON.stringify(body.businessVerticals) : null,
        notes: body.notes || null,
        status: 'CONFIRMED',
        companyId: company.id,
        legalEntityId: legalEntity.id,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: customer.id,
        activityType: 'CREATED',
        description: `Customer created for company: ${customer.companyName}`,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'CUSTOMER', entityId: customer.id, newValue: customer, description: `Customer created: ${customer.companyName}`, request });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/customers error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create customer' }, { status: 400 });
  }
}
