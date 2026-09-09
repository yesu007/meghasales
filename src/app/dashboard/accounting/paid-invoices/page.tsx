import { redirect } from 'next/navigation';

// This route was folded into the Invoices module's own "Paid Invoices"
// tab (src/app/dashboard/accounting/invoices/page.tsx) — kept as a
// redirect so any existing bookmarks/links to this URL keep working.
export default function PaidInvoicesPage() {
  redirect('/dashboard/accounting/invoices?tab=paid');
}
