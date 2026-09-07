import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Product master — same shape/convention as /api/projects (see the Product
// model's own schema comment): a Customer (Lead) + Vertical pairing with a
// responsible Head and Budget, its own separate table rather than a
// sub-type of Project.
//
// GET returns only active products by default, same convention as
// /api/projects/verticals; the admin screen passes includeInactive=true to
// also see (and be able to reactivate) deactivated ones.
//
// leadId scopes the result to products related to one Lead/Customer, same
// "Customer IS a Lead with status=CONFIRMED" convention as /api/projects —
// a Product can be related to that row two independent ways (customerId or
// leadId), matched with OR since either counts as "belongs to this
// Lead/Customer".
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_products');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const leadIdParam = searchParams.get('leadId');
    // Opt-in, same convention as /api/projects's own includeImplementation —
    // used by the Customer main table's own CustomerProductsPanel, which
    // needs each Product's own Status/Stage (that live on its
    // Implementation, not on Product itself — see the Product model's own
    // comment) without making every other caller of this endpoint pay for
    // the extra join.
    const includeImplementation = searchParams.get('includeImplementation') === 'true';

    const where: Prisma.ProductWhereInput = includeInactive ? {} : { isActive: true };
    if (leadIdParam) {
      const leadId = parseInt(leadIdParam);
      if (Number.isNaN(leadId)) return NextResponse.json({ message: 'Invalid leadId' }, { status: 400 });
      where.OR = [{ customerId: leadId }, { leadId }];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true, contactPerson: true } },
        vertical: { select: { id: true, name: true } },
        head: { select: { id: true, firstName: true, lastName: true } },
        ...(includeImplementation && {
          // Most-recently-created Implementation for this Product, same
          // "latest wins" convention as /api/leads's own includeImplementation.
          implementations: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { id: true, status: true, currentStage: true },
          },
        }),
      },
    });

    const content = products.map((p) => ({
      id: p.id,
      productName: p.productName,
      customerId: p.customerId,
      customerName: p.customer?.companyName ?? null,
      leadId: p.leadId,
      leadName: p.lead?.companyName ?? null,
      verticalId: p.verticalId,
      verticalName: p.vertical.name,
      headId: p.headId,
      headName: p.head ? `${p.head.firstName} ${p.head.lastName}` : null,
      budget: p.budget,
      budgetCurrencyCode: p.budgetCurrencyCode,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      // Only present when includeImplementation=true was passed (see above)
      // — this Product's most-recently-created Implementation, or null if
      // it has none yet.
      ...(includeImplementation && {
        implementation: (p as any).implementations?.[0]
          ? {
              id: (p as any).implementations[0].id,
              status: (p as any).implementations[0].status,
              currentStage: (p as any).implementations[0].currentStage,
            }
          : null,
      }),
    }));

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/products error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_products');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.productName || !String(body.productName).trim()) {
      return NextResponse.json({ message: 'Product name is required' }, { status: 400 });
    }
    // Customer and Lead are mutually exclusive — a Product belongs to
    // exactly one of them, never both, never neither. Same rule as Project.
    if (body.customerId && body.leadId) {
      return NextResponse.json({ message: 'Select either a Customer or a Lead, not both' }, { status: 400 });
    }
    if (!body.customerId && !body.leadId) {
      return NextResponse.json({ message: 'Select a Customer or a Lead' }, { status: 400 });
    }
    if (!body.verticalId) {
      return NextResponse.json({ message: 'Vertical is required' }, { status: 400 });
    }
    if (body.budget === undefined || body.budget === null || body.budget === '') {
      return NextResponse.json({ message: 'Budget is required' }, { status: 400 });
    }

    if (body.customerId) {
      const customer = await prisma.lead.findUnique({ where: { id: parseInt(body.customerId) }, select: { id: true } });
      if (!customer) return NextResponse.json({ message: 'Selected customer not found' }, { status: 404 });
    }

    // No duplicate Product — same name (case-insensitive) already recorded
    // for the same Customer/Lead among active products. A deleted one with
    // the same name/owner doesn't block this, same soft-delete convention
    // as every other Master module (e.g. Lead Sources/Stages) — only an
    // active duplicate is rejected.
    {
      const duplicate = await prisma.product.findFirst({
        where: {
          isActive: true,
          productName: { equals: String(body.productName).trim(), mode: 'insensitive' },
          ...(body.customerId ? { customerId: parseInt(body.customerId) } : { leadId: parseInt(body.leadId) }),
        },
        select: { id: true },
      });
      if (duplicate) return NextResponse.json({ message: 'A product with this name already exists for this customer/lead' }, { status: 409 });
    }

    // Head is derived from the selected Vertical's own Head assignment
    // (Vertical.headId), never taken from the client — same convention as
    // Project.headId.
    const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.verticalId) }, select: { id: true, headId: true } });
    if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
    if (!vertical.headId) return NextResponse.json({ message: 'Selected vertical has no Head assigned' }, { status: 400 });

    if (body.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: parseInt(body.leadId) }, select: { id: true } });
      if (!lead) return NextResponse.json({ message: 'Selected lead not found' }, { status: 404 });
    }

    const product = await prisma.product.create({
      data: {
        productName: String(body.productName).trim(),
        customerId: body.customerId ? parseInt(body.customerId) : null,
        leadId: body.leadId ? parseInt(body.leadId) : null,
        verticalId: vertical.id,
        headId: vertical.headId,
        budget: Number(body.budget),
        budgetCurrencyCode: body.budgetCurrencyCode || 'INR',
      },
      include: {
        customer: { select: { companyName: true } },
        lead: { select: { companyName: true, contactPerson: true } },
        vertical: { select: { name: true } },
        head: { select: { firstName: true, lastName: true } },
      },
    });

    const ownerName = product.customer?.companyName || product.lead?.companyName || 'unknown';
    await logAudit({ action: 'CREATE', entityType: 'PRODUCT', entityId: product.id, newValue: product, description: `Product "${product.productName}" created for "${ownerName}"`, request });

    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/products error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create product' }, { status: 400 });
  }
}
