import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { resolveLeadCountryFields } from '@/lib/leadCountry';
import { leadStatusLabel } from '@/lib/leadStatus';
import { CUSTOMER_STATUSES, customerStatusLabel } from '@/lib/customerStatus';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        assignedBa: { select: { firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const statusChanged = !!body.status && body.status !== existing.status;

    if (body.customerStatus !== undefined && !CUSTOMER_STATUSES.some((s) => s.value === body.customerStatus)) {
      return NextResponse.json({ message: 'Invalid customer status' }, { status: 400 });
    }
    const customerStatusChanged = !!body.customerStatus && body.customerStatus !== existing.customerStatus;

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt(session.user.id, 10) : null;

    let countryFields: Awaited<ReturnType<typeof resolveLeadCountryFields>> | null = null;
    if (body.countryId !== undefined) {
      const isAdmin = (session?.user?.roles || []).includes('ADMIN');
      try {
        countryFields = await resolveLeadCountryFields(parseInt(body.countryId), { isAdmin, overrideCurrencyCode: body.currencyCode });
      } catch (e: any) {
        return NextResponse.json({ message: e.message || 'Invalid country selected' }, { status: 400 });
      }
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(body.companyName && { companyName: body.companyName }),
        ...(body.contactPerson && { contactPerson: body.contactPerson }),
        ...(body.mobile !== undefined && { mobile: body.mobile }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.leadSource && { leadSource: body.leadSource }),
        ...(body.status && { status: body.status }),
        ...(body.customerStatus && { customerStatus: body.customerStatus }),
        ...(body.assignedBaId !== undefined && { assignedBaId: body.assignedBaId ? parseInt(body.assignedBaId) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.state !== undefined && { state: body.state }),
        ...(countryFields && {
          country: countryFields.country,
          countryId: countryFields.countryId,
          currencyCode: countryFields.currencyCode,
          currencySymbol: countryFields.currencySymbol,
          taxType: countryFields.taxType,
        }),
        ...(body.businessVerticals !== undefined && { businessVerticals: body.businessVerticals ? JSON.stringify(body.businessVerticals) : null }),
        ...(body.companyId !== undefined && { companyId: body.companyId ? parseInt(body.companyId) : null }),
      },
      include: { company: { select: { id: true, name: true } } },
    });

    // Log every status transition (not just ->Converted) so the activity
    // timeline is a complete status-change history, not a partial one.
    // 'LEAD_CONFIRMED' is kept as its own type for the Converted transition
    // specifically since it has its own icon/meaning; every other
    // transition gets a generic 'STATUS_CHANGED' entry.
    if (statusChanged) {
      await prisma.leadActivity.create({
        data: {
          leadId: id,
          activityType: lead.status === 'CONFIRMED' ? 'LEAD_CONFIRMED' : 'STATUS_CHANGED',
          description: lead.status === 'CONFIRMED'
            ? `Lead confirmed: ${lead.companyName}`
            : `Status changed from ${leadStatusLabel(existing.status)} to ${leadStatusLabel(lead.status)}`,
          performedById: Number.isFinite(performedById) ? performedById : null,
        },
      });
    }

    if (customerStatusChanged) {
      await prisma.leadActivity.create({
        data: {
          leadId: id,
          activityType: 'CUSTOMER_STATUS_CHANGED',
          description: `Customer status changed from ${customerStatusLabel(existing.customerStatus)} to ${customerStatusLabel(lead.customerStatus)}`,
          performedById: Number.isFinite(performedById) ? performedById : null,
        },
      });
    }

    await logAudit({ action: 'UPDATE', entityType: 'LEAD', entityId: id, oldValue: existing, newValue: lead, description: `Lead updated: ${lead.companyName}`, request });

    return NextResponse.json(lead);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    await prisma.lead.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'LEAD', entityId: id, oldValue: existing, description: `Lead deleted: ${existing.companyName}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete lead' }, { status: 400 });
  }
}
