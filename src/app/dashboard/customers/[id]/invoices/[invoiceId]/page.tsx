'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import InvoiceDetail, { fetchInvoice } from '@/components/accounting/InvoiceDetail';

// The Customer module's own invoice detail route — a real child route under
// /dashboard/customers/:id, not a query-param workaround on the Accounting
// route. Clicking View from a customer's Invoices/Paid Invoices tab
// (src/app/dashboard/customers/[id]/page.tsx, via the leadId-aware link in
// src/components/accounting/InvoiceListPage.tsx) lands here, so the URL and
// back navigation never leave the Customer module.
//
// Reuses the exact same InvoiceDetail component the Accounting module's
// route renders — no duplicated invoice UI. Which tab Back returns to
// (Invoices vs Paid Invoices) is derived from the invoice's own status
// rather than carried in the URL: this query shares its cache/result with
// the identical query InvoiceDetail itself runs, so it costs no extra
// network round trip.
export default function CustomerInvoiceDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const invoiceId = params.invoiceId as string;

  const { data: invoice } = useQuery({
    queryKey: ['accounting-invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
  });

  const tab = invoice?.status === 'PAID' ? 'paid-invoices' : 'invoices';
  const backHref = `/dashboard/customers/${customerId}?tab=${tab}`;

  return <InvoiceDetail invoiceId={invoiceId} backHref={backHref} />;
}
