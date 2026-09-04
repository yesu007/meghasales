'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import InvoiceDetail, { fetchInvoice } from '@/components/accounting/InvoiceDetail';

// Accounting module's own invoice route — unchanged URL
// (/dashboard/accounting/invoices/:id). Which tab Back returns to (Pending
// vs Paid) is derived from the invoice's own status, same pattern as the
// Customer module's identical route
// (src/app/dashboard/customers/[id]/invoices/[invoiceId]/page.tsx) — this
// query shares its cache/result with the identical query InvoiceDetail
// itself runs, so it costs no extra network round trip.
export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: invoice } = useQuery({
    queryKey: ['accounting-invoice', id],
    queryFn: () => fetchInvoice(id),
  });

  const backHref = invoice?.status === 'PAID' ? '/dashboard/accounting/invoices?tab=paid' : '/dashboard/accounting/invoices';

  return <InvoiceDetail invoiceId={id} backHref={backHref} />;
}
