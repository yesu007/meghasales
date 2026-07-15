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
    const leadId = searchParams.get('leadId') || '';

    const where: Prisma.CreditNoteWhereInput = { deletedAt: null };
    if (leadId) where.leadId = parseInt(leadId);

    const [creditNotes, totalElements] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
        include: { lead: { select: { companyName: true } }, invoice: { select: { invoiceNumber: true } } },
      }),
      prisma.creditNote.count({ where }),
    ]);

    const content = creditNotes.map((c) => ({
      id: c.id,
      creditNoteNumber: c.creditNoteNumber,
      leadId: c.leadId,
      companyName: c.lead.companyName,
      invoiceId: c.invoiceId,
      invoiceNumber: c.invoice?.invoiceNumber || null,
      amount: c.amount,
      reason: c.reason,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({ content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) });
  } catch (error: any) {
    console.error('GET /api/accounting/credit-notes error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.leadId) return NextResponse.json({ message: 'leadId is required' }, { status: 400 });
    if (!body.amount || Number(body.amount) <= 0) return NextResponse.json({ message: 'amount must be greater than zero' }, { status: 400 });

    const count = await prisma.creditNote.count();
    const creditNoteNumber = `CN-${String(count + 1).padStart(5, '0')}`;

    const creditNote = await prisma.creditNote.create({
      data: {
        creditNoteNumber,
        leadId: parseInt(body.leadId),
        invoiceId: body.invoiceId ? parseInt(body.invoiceId) : null,
        amount: body.amount,
        reason: body.reason || null,
        issuedById: body.issuedById ? parseInt(body.issuedById) : null,
      },
      include: { lead: { select: { companyName: true } } },
    });

    await logAudit({ action: 'CREATE', entityType: 'CREDIT_NOTE', entityId: creditNote.id, newValue: creditNote, description: `Credit note ${creditNote.creditNoteNumber} of ${creditNote.amount} issued to ${creditNote.lead.companyName}`, request });

    return NextResponse.json(creditNote, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/accounting/credit-notes error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create credit note' }, { status: 400 });
  }
}
