import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { BillValidationError, findDuplicateBill, parseBillInput, syncBillExpense } from '@/lib/bills';

export const dynamic = 'force-dynamic';

async function currentUserId() {
  const session = await getServerSession(authOptions);
  const id = session?.user ? parseInt((session.user as any).id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const bill = await prisma.bill.findFirst({
      where: { id: parseInt(params.id), deletedAt: null },
      include: {
        supplier: true,
        category: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' }, include: { subCategory: { select: { name: true } } } },
        expense: { select: { id: true, expenseNumber: true, status: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!bill) return NextResponse.json({ message: 'Bill not found' }, { status: 404 });
    return NextResponse.json(bill);
  } catch (error) {
    console.error('GET /api/bills/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Edits a DRAFT bill (replacing its line items); body.post = true also posts
// it. Posted bills are locked — only their payment status changes, via
// ./payment/route.ts.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const existing = await prisma.bill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ message: 'Bill not found' }, { status: 404 });
    if (existing.status === 'POSTED') {
      return NextResponse.json({ message: 'A posted bill cannot be edited — only its payment status can be updated' }, { status: 400 });
    }

    const parsed = await parseBillInput(prisma, body);
    if (!body.allowDuplicate) {
      const dup = await findDuplicateBill(prisma, parsed.supplier.id, parsed.bill.invoiceNumber, id);
      if (dup) {
        return NextResponse.json({ code: 'DUPLICATE_INVOICE', message: `Invoice ${parsed.bill.invoiceNumber} from ${parsed.supplier.name} is already recorded as ${dup.billNumber}` }, { status: 409 });
      }
    }

    const post = body.post === true;
    const performedById = await currentUserId();
    const bill = await prisma.$transaction(async (tx) => {
      await tx.billItem.deleteMany({ where: { billId: id } });
      const updated = await tx.bill.update({
        where: { id },
        data: {
          ...parsed.bill,
          ...(post && { status: 'POSTED', postedAt: new Date() }),
          items: { create: parsed.items },
        },
      });
      if (post) await syncBillExpense(tx, id, performedById);
      return updated;
    });

    await logAudit({ action: 'UPDATE', entityType: 'BILL', entityId: id, oldValue: existing, newValue: bill, description: `Bill ${bill.billNumber} ${post ? 'posted' : 'updated'} — payable ${bill.payableAmount}`, request });
    return NextResponse.json(bill);
  } catch (error: any) {
    if (error instanceof BillValidationError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('PUT /api/bills/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update bill' }, { status: 400 });
  }
}

// Soft delete; a posted bill's linked expense is soft-deleted with it.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.bill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ message: 'Bill not found' }, { status: 404 });

    const performedById = await currentUserId();
    await prisma.$transaction(async (tx) => {
      await tx.bill.update({ where: { id }, data: { deletedAt: new Date() } });
      await syncBillExpense(tx, id, performedById);
    });

    await logAudit({ action: 'DELETE', entityType: 'BILL', entityId: id, oldValue: existing, description: `Bill ${existing.billNumber} deleted`, request });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/bills/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete bill' }, { status: 400 });
  }
}
