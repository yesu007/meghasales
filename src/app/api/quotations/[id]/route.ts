import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, email: true, mobile: true } },
      },
    });
    if (!quotation) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });
    return NextResponse.json(quotation);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Quotation not found' }, { status: 404 });

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.totalAmount !== undefined && { totalAmount: body.totalAmount }),
        ...(body.discountPercentage !== undefined && { discountPercentage: body.discountPercentage }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
      },
    });

    return NextResponse.json(quotation);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update quotation' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.quotation.delete({ where: { id: parseInt(params.id) } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete quotation' }, { status: 400 });
  }
}
