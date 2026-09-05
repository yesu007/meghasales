'use client';

import { useQuery } from '@tanstack/react-query';
import { TagIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface ProductRow {
  id: number;
  productName: string;
  verticalName: string;
  headName: string | null;
  budget: string | null;
  budgetCurrencyCode: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ProductsTabProps {
  leadId: number;
}

// Mirrors src/components/leads/ProjectsTab.tsx exactly — reuses the
// existing Product Master's own API/data — GET /api/products already
// matches a Lead/Customer id against either Product.customerId or
// Product.leadId, the same relationship this tab needs. No separate data
// source, no duplicate Product Master; this is a read-only view scoped to
// one leadId.
async function fetchClientProducts(leadId: number): Promise<ProductRow[]> {
  const res = await fetch(`/api/products?leadId=${leadId}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export default function ProductsTab({ leadId }: ProductsTabProps) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['lead-products', leadId],
    queryFn: () => fetchClientProducts(leadId),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Client Products</h2>
      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <TagIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-slate-600 font-medium">No Products Found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {products.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.productName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.verticalName}
                  {p.headName && <> · {p.headName}</>}
                  {p.budget != null && <> · {formatCurrency(p.budget, p.budgetCurrencyCode || 'INR')}</>}
                  {' · '}Created {dayjs(p.createdAt).format('DD MMM YYYY')}
                </p>
              </div>
              <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.isActive ? 'Active' : 'Deleted'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
