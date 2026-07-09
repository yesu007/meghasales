import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
        ...(body.country !== undefined && { country: body.country }),
      },
    });

    return NextResponse.json(lead);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.lead.delete({ where: { id: parseInt(params.id) } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete lead' }, { status: 400 });
  }
}
