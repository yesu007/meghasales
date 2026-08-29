import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { computeResourceCosting, type ResourceLine, type CostMode } from '@/lib/quotationResourceCosting';

// Validates and normalizes the raw request body for a resource-based
// (Quotation Calculator) quotation, then runs it through the shared pure
// costing math. Throws a descriptive Error on bad input — caught by the
// route's existing try/catch and reported as a 400, same convention as
// every other module's inline create-time validation (e.g. Expense Budgets).
function buildResourceBasedCosting(body: any) {
  const rawResources = Array.isArray(body.resources) ? body.resources : [];
  if (rawResources.length === 0) throw new Error('At least one resource line item is required');

  const resources: ResourceLine[] = rawResources.map((r: any, idx: number) => {
    const role = String(r.role || '').trim();
    const qty = Number(r.qty);
    const durationDays = Number(r.durationDays);
    const dayRate = Number(r.dayRate);
    if (!role) throw new Error(`Resource #${idx + 1} is missing a role`);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Resource #${idx + 1} must have a quantity greater than 0`);
    if (!Number.isFinite(durationDays) || durationDays <= 0) throw new Error(`Resource #${idx + 1} must have a duration greater than 0`);
    if (!Number.isFinite(dayRate) || dayRate <= 0) throw new Error(`Resource #${idx + 1} must have a day rate greater than 0`);
    return { role, qty, durationDays, dayRate };
  });

  const adminMode: CostMode = body.adminMode === 'FIXED' ? 'FIXED' : 'PCT';
  const adminValue = Number(body.adminValue) || 0;
  const outsourcingCost = Number(body.outsourcingCost) || 0;
  const travelCost = Number(body.travelCost) || 0;
  const markupMode: CostMode = body.markupMode === 'FIXED' ? 'FIXED' : 'PCT';
  const markupValue = Number(body.markupValue) || 0;
  const discountMode: CostMode = body.discountMode === 'FIXED' ? 'FIXED' : 'PCT';
  const discountValue = Number(body.discountValue) || 0;
  const taxPercentage = Number(body.taxPercentage) || 0;
  const overrideAmount = Number(body.overrideAmount) || 0;
  const validityDays = Number(body.validityDays) || 30;

  if (adminValue < 0) throw new Error('Admin/overhead value cannot be negative');
  if (outsourcingCost < 0) throw new Error('Outsourcing cost cannot be negative');
  if (travelCost < 0) throw new Error('Travel cost cannot be negative');
  if (markupValue < 0) throw new Error('Markup value cannot be negative');
  if (discountValue < 0) throw new Error('Discount value cannot be negative');
  if (taxPercentage < 0) throw new Error('Tax percentage cannot be negative');
  if (overrideAmount < 0) throw new Error('Override amount cannot be negative');
  if (validityDays < 1) throw new Error('Quotation validity must be at least 1 day');

  const costing = computeResourceCosting({
    resources, adminMode, adminValue, outsourcingCost, travelCost, markupMode, markupValue, discountMode, discountValue, taxPercentage, overrideAmount,
  });

  return {
    costingMode: 'RESOURCE_BASED' as const,
    projectName: body.projectName ? String(body.projectName).trim() : null,
    resourceCostTotal: costing.resourceCostTotal,
    outsourcingCost,
    travelCost,
    adminCost: costing.adminCost,
    markupPercentage: markupMode === 'PCT' ? markupValue : null,
    markupAmount: costing.markupAmount,
    discountPercentage: discountMode === 'PCT' ? discountValue : null,
    discountAmount: costing.discountAmount,
    marginPercent: costing.marginPercent,
    calculatedTotalAmount: costing.calculatedTotalAmount,
    totalAmount: costing.totalAmount,
    totalAmountOverridden: costing.totalAmountOverridden,
    taxPercentage,
    taxAmount: costing.taxAmount,
    validUntil: dayjs().add(validityDays, 'day').toDate(),
    pricingSnapshot: {
      resources,
      adminMode,
      adminValue,
      markupMode,
      markupValue,
      discountMode,
      discountValue,
      projectManagerName: body.projectManagerName ? String(body.projectManagerName).trim() : null,
      packageName: body.packageName ? String(body.packageName).trim() : null,
      validityDays,
    },
  };
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_quotations');
  if (denied) return denied;

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
      costingMode: q.costingMode,
      projectName: q.projectName,
      outsourcingCost: q.outsourcingCost ? Number(q.outsourcingCost) : 0,
      travelCost: q.travelCost ? Number(q.travelCost) : 0,
      adminCost: q.adminCost ? Number(q.adminCost) : 0,
      markupAmount: q.markupAmount ? Number(q.markupAmount) : 0,
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
  const denied = await requirePermission('manage_quotations');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.leadId && !body.companyName) {
      return NextResponse.json({ message: 'leadId or companyName is required' }, { status: 400 });
    }

    // Resource-based (Quotation Calculator) costing is validated up front,
    // before any lead is created or country/currency work happens below —
    // a validation failure here must never leave behind an orphaned
    // auto-created Lead with no quotation to show for it.
    let resourceBasedFields: ReturnType<typeof buildResourceBasedCosting> | null = null;
    if (body.costingMode === 'RESOURCE_BASED') {
      resourceBasedFields = buildResourceBasedCosting(body);
      if (body.verticalId) {
        const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) } });
        if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
      }
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

    const data: Prisma.QuotationUncheckedCreateInput = {
      leadId: leadId!,
      quotationNumber,
      clientCountry,
      clientState,
      currencyCode,
      exchangeRate: body.exchangeRate || 1,
      notes: body.notes || null,
      status: 'DRAFT',
    };
    if (resourceBasedFields) {
      Object.assign(data, resourceBasedFields, { verticalId: body.verticalId ? parseInt(body.verticalId) : null });
    } else {
      Object.assign(data, {
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
        taxInclusive: !!body.taxInclusive,
        totalAmount: body.totalAmount || null,
        taxBreakdown: body.taxBreakdown || null,
        addons: body.addons || null,
        pricingSnapshot: body.pricingSnapshot || null,
      });
    }

    const quotation = await prisma.quotation.create({
      data,
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
