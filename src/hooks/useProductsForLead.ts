'use client';

import { useQuery } from '@tanstack/react-query';

export interface LeadProductOption {
  id: number;
  productName: string;
  verticalId: number;
  verticalName: string;
  headId: number | null;
  headName: string | null;
}

async function fetchProductsForLead(leadId: string): Promise<LeadProductOption[]> {
  const res = await fetch(`/api/products?leadId=${leadId}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

// Mirrors src/hooks/useProjectsForLead.ts exactly, just for Product Master
// — products related to one selected Lead/Customer, matched either via
// Product.customerId or Product.leadId (see GET /api/products's own leadId
// filter). Shared by every module whose Product dropdown must be scoped to
// whichever Lead/Customer is currently selected.
export function useProductsForLead(leadId: string | number | null | undefined) {
  const id = leadId ? String(leadId) : '';
  return useQuery<LeadProductOption[]>({
    queryKey: ['products-for-lead', id],
    queryFn: () => fetchProductsForLead(id),
    enabled: !!id,
  });
}
