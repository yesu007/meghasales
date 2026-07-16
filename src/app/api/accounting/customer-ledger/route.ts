import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// The ledger is computed on the fly from Invoice/Payment/CreditNote rows
// rather than stored — a persisted ledger_entries table would need to stay
// in lockstep with every mutation across three other tables, which is a
// real double-entry-bookkeeping engine and out of scope here.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    if (!leadId) return NextResponse.json({ message: 'leadId is required' }, { status: 400 });

    const lead = await prisma.lead.findUnique({ where: { id: parseInt(leadId) }, select: { id: true, companyName: true, currencyCode: true } });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;

    const [allInvoices, allPayments, allCreditNotes] = await Promise.all([
      prisma.invoice.findMany({ where: { leadId: lead.id, deletedAt: null }, select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true } }),
      prisma.payment.findMany({ where: { invoice: { leadId: lead.id }, deletedAt: null }, select: { id: true, paymentNumber: true, paymentDate: true, amount: true, invoice: { select: { invoiceNumber: true } } } }),
      prisma.creditNote.findMany({ where: { leadId: lead.id, deletedAt: null }, select: { id: true, creditNoteNumber: true, createdAt: true, amount: true } }),
    ]);

    const isBeforeRange = (d: Date) => fromDate !== null && d < fromDate;
    const isInRange = (d: Date) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

    let openingBalance = 0;
    for (const inv of allInvoices) if (isBeforeRange(inv.invoiceDate)) openingBalance += Number(inv.totalAmount);
    for (const p of allPayments) if (isBeforeRange(p.paymentDate)) openingBalance -= Number(p.amount);
    for (const c of allCreditNotes) if (isBeforeRange(c.createdAt)) openingBalance -= Number(c.amount);

    type Txn = { date: Date; type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE'; reference: string; debit: number; credit: number };
    const txns: Txn[] = [];
    for (const inv of allInvoices) if (isInRange(inv.invoiceDate)) txns.push({ date: inv.invoiceDate, type: 'INVOICE', reference: inv.invoiceNumber, debit: Number(inv.totalAmount), credit: 0 });
    for (const p of allPayments) if (isInRange(p.paymentDate)) txns.push({ date: p.paymentDate, type: 'PAYMENT', reference: `${p.paymentNumber} (${p.invoice.invoiceNumber})`, debit: 0, credit: Number(p.amount) });
    for (const c of allCreditNotes) if (isInRange(c.createdAt)) txns.push({ date: c.createdAt, type: 'CREDIT_NOTE', reference: c.creditNoteNumber, debit: 0, credit: Number(c.amount) });

    txns.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = openingBalance;
    const transactions = txns.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    return NextResponse.json({
      leadId: lead.id,
      companyName: lead.companyName,
      currencyCode: lead.currencyCode || 'INR',
      openingBalance,
      transactions,
      closingBalance: runningBalance,
    });
  } catch (error: any) {
    console.error('GET /api/accounting/customer-ledger error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
