import { Suspense } from 'react';
import QuotationCalculatorForm from './QuotationCalculatorForm';

export default function NewQuotationCalculatorPage() {
  // QuotationCalculatorForm reads ?projectId=/&leadId= (e.g. from the
  // Projects page's "New Quotation" link) via useSearchParams, which
  // requires a Suspense boundary to keep this route statically prerenderable.
  return (
    <Suspense>
      <QuotationCalculatorForm />
    </Suspense>
  );
}
