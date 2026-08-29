import QuotationCalculatorForm from '../QuotationCalculatorForm';

export default function EditQuotationCalculatorPage({ params }: { params: { id: string } }) {
  return <QuotationCalculatorForm quotationId={parseInt(params.id, 10)} />;
}
