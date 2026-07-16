import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';

    const where: Prisma.QuotationWhereInput = {};
    const AND: Prisma.QuotationWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim().toLowerCase();
      AND.push({
        OR: [
          { quotationNumber: { contains: searchTerm, mode: 'insensitive' } },
          { lead: { companyName: { contains: searchTerm, mode: 'insensitive' } } },
          { lead: { contactPerson: { contains: searchTerm, mode: 'insensitive' } } },
          { businessModule: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    if (status) AND.push({ status: status.toUpperCase() });
    // Used by the invoice-creation quotation picker — since approval now
    // auto-generates an invoice, only quotations still missing one (e.g.
    // approved before that existed) should show up as pickable there.
    if (searchParams.get('withoutInvoice') === 'true') AND.push({ invoices: { none: { deletedAt: null } } });

    if (AND.length > 0) where.AND = AND;

    const validSortFields = ['createdAt', 'totalAmount', 'status', 'quotationNumber'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [quotations, totalElements] = await Promise.all([
      prisma.quotation.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          lead: { select: { companyName: true, contactPerson: true } },
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    const content = quotations.map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber,
      leadId: q.leadId,
      companyName: q.lead.companyName,
      contactPerson: q.lead.contactPerson,
      businessModule: q.businessModule,
      softwareModules: q.softwareModules,
      totalAmount: q.totalAmount ? Number(q.totalAmount) : 0,
      currencyCode: q.currencyCode,
      status: q.status,
      version: q.version,
      validUntil: q.validUntil,
      pricingSnapshot: q.pricingSnapshot,
      createdAt: q.createdAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
    });
  } catch (error: any) {
    console.error('GET /api/quotations error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.leadId && !body.companyName) {
      return NextResponse.json({ message: 'leadId or companyName is required' }, { status: 400 });
    }

    // Country/currency for the quotation always comes from the Country
    // master, resolved server-side, never trusted verbatim from the client —
    // this is what makes "quotations generated from a lead automatically use
    // the lead's currency" actually hold even if a stale/mismatched
    // pricingSnapshot gets submitted alongside it.
    const countryRow = body.clientCountry
      ? await prisma.country.findUnique({ where: { isoCode: String(body.clientCountry).toUpperCase() } })
      : null;

    // If no leadId, create a lead first
    let leadId = body.leadId ? parseInt(body.leadId) : null;
    if (!leadId && body.companyName) {
      const lead = await prisma.lead.create({
        data: {
          companyName: body.companyName,
          contactPerson: body.clientName || body.companyName,
          email: body.clientEmail || null,
          mobile: body.clientPhone || null,
          leadSource: 'QUOTATION',
          status: 'QUALIFIED',
          ...(countryRow && {
            country: countryRow.countryName,
            countryId: countryRow.id,
            currencyCode: countryRow.currencyCode,
            currencySymbol: countryRow.currencySymbol,
            taxType: countryRow.defaultTaxType,
          }),
        },
      });
      leadId = lead.id;
    }

    // When quoting an existing lead, the lead's own country/currency wins
    // over anything the client sent — the quote can't drift onto a
    // different currency than the lead it belongs to.
    let clientCountry = countryRow?.isoCode || body.clientCountry || null;
    let clientState = body.clientState || null;
    let currencyCode = countryRow?.currencyCode || body.currencyCode || 'INR';
    if (body.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId! }, include: { countryRef: true } });
      if (lead?.countryRef) {
        clientCountry = lead.countryRef.isoCode;
        currencyCode = lead.countryRef.currencyCode;
      }
      clientState = clientState || lead?.state || null;
    }

    // Generate quotation number
    const count = await prisma.quotation.count();
    const quotationNumber = `QTN-${String(count + 1).padStart(5, '0')}`;

    const quotation = await prisma.quotation.create({
      data: {
        leadId: leadId!,
        quotationNumber,
        softwareModules: body.softwareModules || null,
        businessModule: body.businessModule || null,
        implementationCost: body.implementationCost || null,
        trainingCost: body.trainingCost || null,
        annualMaintenance: body.annualMaintenance || null,
        customDevelopmentCost: body.customDevelopmentCost || null,
        discountPercentage: body.discountPercentage || null,
        discountAmount: body.discountAmount || null,
        taxPercentage: body.taxPercentage || null,
        taxAmount: body.taxAmount || null,
        totalAmount: body.totalAmount || null,
        clientCountry,
        clientState,
        currencyCode,
        exchangeRate: body.exchangeRate || 1,
        taxBreakdown: body.taxBreakdown || null,
        addons: body.addons || null,
        pricingSnapshot: body.pricingSnapshot || null,
        notes: body.notes || null,
        status: 'DRAFT',
      },
      include: {
        lead: { select: { companyName: true } },
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'QUOTATION', entityId: quotation.id, newValue: quotation, description: `Quotation ${quotation.quotationNumber} created for ${quotation.lead.companyName}`, request });

    return NextResponse.json(quotation, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/quotations error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create quotation' }, { status: 400 });
  }
}
