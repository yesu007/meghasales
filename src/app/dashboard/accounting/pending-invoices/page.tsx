import { redirect } from 'next/navigation';

// This route was folded into the Invoices module's own "Pending Invoices"
// tab (src/app/dashboard/accounting/invoices/page.tsx) — kept as a
// redirect so any existing bookmarks/links to this URL keep working.
export default function PendingInvoicesPage() {
  redirect('/dashboard/accounting/invoices');
}
