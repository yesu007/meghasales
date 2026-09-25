import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { BillValidationError, findDuplicateBill, nextBillNumber, parseBillInput, syncBillExpense } from '@/lib/bills';

export const dynamic = 'force-dynamic';

// Vendor bills (Finance → Bills). Same view/manage_expenses permissions as
// the Expenses module, since a posted bill becomes an expense.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = (searchParams.get('search') || '').trim();
    const status = searchParams.get('status') || '';
    const paymentStatus = searchParams.get('paymentStatus') || '';
    const billType = searchParams.get('billType') || '';
    const categoryId = searchParams.get('categoryId') || '';

    const where: Prisma.BillWhereInput = { deletedAt: null };
    if (search) {
      where.OR = [
        { billNumber: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { gstin: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (billType) where.billType = billType;
    if (categoryId) where.categoryId = parseInt(categoryId);

    const [bills, totalElements] = await Promise.all([
      prisma.bill.findMany({
        where,
        orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
        skip: page * size,
        take: size,
        include: {
          supplier: { select: { id: true, name: true, gstin: true } },
          category: { select: { name: true } },
          expense: { select: { id: true, expenseNumber: true, status: true } },
        },
      }),
      prisma.bill.count({ where }),
    ]);

    return NextResponse.json({
      content: bills,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error) {
    console.error('GET /api/bills error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Creates a bill as DRAFT, or posts it straight away when body.post is true
// (which also creates the linked expense).
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    const session = await getServerSession(authOptions);
    const userId = session?.user ? parseInt((session.user as any).id, 10) : NaN;
    const performedById = Number.isFinite(userId) ? userId : null;

    const parsed = await parseBillInput(prisma, body);
    if (!body.allowDuplicate) {
      const dup = await findDuplicateBill(prisma, parsed.supplier.id, parsed.bill.invoiceNumber);
      if (dup) {
        return NextResponse.json({ code: 'DUPLICATE_INVOICE', message: `Invoice ${parsed.bill.invoiceNumber} from ${parsed.supplier.name} is already recorded as ${dup.billNumber}` }, { status: 409 });
      }
    }

    const post = body.post === true;
    const bill = await prisma.$transaction(async (tx) => {
      const created = await tx.bill.create({
        data: {
          ...parsed.bill,
          billNumber: await nextBillNumber(tx),
          status: post ? 'POSTED' : 'DRAFT',
          postedAt: post ? new Date() : null,
          createdById: performedById,
          items: { create: parsed.items },
        },
      });
      if (post) await syncBillExpense(tx, created.id, performedById);
      return created;
    });

    await logAudit({ action: 'CREATE', entityType: 'BILL', entityId: bill.id, newValue: bill, description: `Bill ${bill.billNumber} (${parsed.supplier.name}, invoice ${bill.invoiceNumber}) ${post ? 'posted' : 'saved as draft'} — payable ${bill.payableAmount}`, request });
    return NextResponse.json(bill, { status: 201 });
  } catch (error: any) {
    if (error instanceof BillValidationError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('POST /api/bills error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create bill' }, { status: 400 });
  }
}
