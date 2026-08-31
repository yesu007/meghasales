'use client';

import { useParams } from 'next/navigation';
import InvoiceDetail from '@/components/accounting/InvoiceDetail';

// Accounting module's own invoice route — unchanged URL
// (/dashboard/accounting/invoices/:id) and unchanged back destination. The
// actual view is InvoiceDetail, shared with the Customer module's own
// nested route at src/app/dashboard/customers/[id]/invoices/[invoiceId]/page.tsx.
export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <InvoiceDetail invoiceId={id} backHref="/dashboard/accounting/pending-invoices" />;
}
