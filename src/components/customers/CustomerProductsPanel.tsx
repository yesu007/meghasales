'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TagIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useStages } from '@/hooks/useStages';
import { IMPLEMENTATION_STATUSES } from '@/lib/implementationStatus';
import { invalidateImplementationData, invalidateProductData } from '@/lib/queryInvalidation';

interface CustomerProductRow {
  id: number;
  productName: string;
  verticalName: string;
  // This Product's most-recently-created Implementation (see GET
  // /api/products's includeImplementation param) — null if it has none yet.
  // Status/Stage below read and write through it, not through Product
  // itself, which has neither field (see the Product model's own comment)
  // — exact same convention as CustomerProjectsPanel's own Project rows.
  implementation: { id: number; status: string; currentStage: string | null } | null;
}

async function fetchCustomerProducts(customerId: number): Promise<CustomerProductRow[]> {
  const res = await fetch(`/api/products?leadId=${customerId}&includeImplementation=true`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

// Same accordion slot as CustomerProjectsPanel, right alongside it — every
// Product Master row linked to this Customer (Product.customerId), same
// "leadId scopes to either customerId or leadId" convention GET
// /api/products already uses for Project's own picker. Status/Stage here
// are a full mirror of CustomerProjectsPanel's own Project rows: read/write
// through this Product's Implementation record (Implementation.productId),
// not through Product itself, which has neither field.
export default function CustomerProductsPanel({ customerId, enabled = true }: { customerId: number; enabled?: boolean }) {
  const queryClient = useQueryClient();
  const stages = useStages();
  const queryKey = ['customer-products', customerId];
  const { data: products = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchCustomerProducts(customerId),
    enabled,
  });

  const updateImplementation = async (implementationId: number, patch: Record<string, any>, successMsg: string) => {
    const res = await fetch(`/api/implementations/${implementationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { toast.error('Failed to update implementation'); return; }
    queryClient.invalidateQueries({ queryKey });
    invalidateImplementationData(queryClient);
    invalidateProductData(queryClient);
    toast.success(successMsg);
  };

  // A Product with no Implementation row yet has nothing to PUT against —
  // silently create one first (same on-demand-create convention as
  // CustomerProjectsPanel's own ensureImplementationThenUpdate), then apply
  // the just-picked value, so the dropdown always saves correctly either
  // way.
  const ensureImplementationThenUpdate = async (product: CustomerProductRow, patch: Record<string, any>, successMsg: string) => {
    let implementationId = product.implementation?.id;
    if (!implementationId) {
      const res = await fetch('/api/implementations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: customerId, sourceType: 'CUSTOMER', productId: product.id }),
      });
      if (!res.ok) { toast.error('Failed to create implementation'); return; }
      implementationId = (await res.json()).id;
    }
    await updateImplementation(implementationId!, patch, successMsg);
  };

  const updateStatus = (product: CustomerProductRow, status: string) => ensureImplementationThenUpdate(product, { status }, 'Status updated');
  const updateStage = (product: CustomerProductRow, currentStage: string) => ensureImplementationThenUpdate(product, { currentStage: currentStage || null }, 'Stage updated');

  return (
    <div className="my-4 bg-white rounded-lg border border-amber-200/70 shadow-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <TagIcon className="h-4 w-4 text-slate-400" />
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Products{!isLoading && products.length > 0 && ` · ${products.length}`}
        </p>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-slate-400">Loading products…</div>
      ) : products.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">No products found</div>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + explicit per-column widths, matching
              CustomerProjectsPanel's own <th> widths exactly (same 4
              columns: Name/Vertical/Status/Stage) — without this, each
              table auto-sizes its own columns off its own widest cell, so
              the same column drifts to a different width/x-position
              between the two tables when both are open under the same
              Customer row. */}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[26%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50/60 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2">Product Name</th>
                <th className="px-4 py-2">Vertical</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => {
                const status = product.implementation?.status || 'PLANNING';
                return (
                  <tr key={product.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800 truncate">{product.productName}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {product.verticalName || 'Not assigned'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={status}
                        onChange={(e) => updateStatus(product, e.target.value)}
                        className={`w-full px-2 py-1 rounded text-xs font-medium border-0 ${IMPLEMENTATION_STATUSES.find(s => s.value === status)?.color || 'bg-slate-100 text-slate-700'}`}
                      >
                        {IMPLEMENTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={product.implementation?.currentStage || ''}
                        onChange={(e) => updateStage(product, e.target.value)}
                        className="w-full px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Select stage</option>
                        {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
