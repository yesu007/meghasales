import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { resolveLeadCountryFields } from '@/lib/leadCountry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(params.id) },
      include: { assignedBa: { select: { firstName: true, lastName: true } } },
    });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const statusChangedToConfirmed = body.status === 'CONFIRMED' && existing.status !== 'CONFIRMED';

    let countryFields: Awaited<ReturnType<typeof resolveLeadCountryFields>> | null = null;
    if (body.countryId !== undefined) {
      const session = await getServerSession(authOptions);
      const isAdmin = (session?.user as any)?.role === 'ADMIN';
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
      },
    });

    if (statusChangedToConfirmed) {
      await prisma.leadActivity.create({
        data: {
          leadId: id,
          activityType: 'LEAD_CONFIRMED',
          description: `Lead confirmed: ${lead.companyName}`,
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
