'use client';

import { useState, useRef, useEffect, Fragment, type ComponentType, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, PencilIcon, TrashIcon, EllipsisVerticalIcon, ArrowPathIcon, MagnifyingGlassIcon, XMarkIcon,
  ChevronDownIcon, ChevronRightIcon, ChartBarIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { usePermissions } from '@/hooks/usePermissions';
import ProductFormDrawer, { blankProductForm, type ProductFormState } from '@/components/products/ProductFormDrawer';
import ProductBudgetPanel from '@/components/products/ProductBudgetPanel';
import { invalidateProductData } from '@/lib/queryInvalidation';

// Mirrors src/app/dashboard/projects/page.tsx (table design, form drawer
// usage, RowActionsMenu, Add/Edit/Delete/Reactivate flow, per-row Budget
// Estimation accordion) — Product Master is the same shape as Project
// Master (see the Product model's own schema comment) and is meant to look
// and behave like it, per that being the explicit reference design for
// this module. Its Budget Estimation panel (ProductBudgetPanel) opens the
// catalog-based Quotation form (/dashboard/quotations) rather than the
// Calculator Project's own panel uses — see that panel's own comment for
// why. Two differences from Project Master remain, both because that's
// genuinely what it does today rather than a deliberate omission here: no
// pagination (GET /api/projects already returns a flat, unpaginated array,
// same as GET /api/products here), and Search, which is new — Project
// Master doesn't have one to copy, so this reuses the client-side
// searchInput/search debounce pattern every other Master module
// (Vertical/Package/Lead Source/Stage) already uses instead.

interface RowActionItem {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  danger?: boolean;
}

// Portal-rendered dropdown — same rationale as Project Master's own
// RowActionsMenu: the table scrolls horizontally (overflow-x-auto), which
// clips an absolutely-positioned menu inside it, so this renders into
// document.body at a computed fixed position instead.
function RowActionsMenu({ items }: { items: RowActionItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.right - 192 });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Row actions">
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: coords.top, left: coords.left }} className="w-48 z-50 rounded-lg bg-white shadow-lg border border-slate-200 py-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 ${item.danger ? 'text-red-600' : 'text-slate-700'}`}
            >
              <item.icon className={`h-4 w-4 ${item.danger ? '' : 'text-slate-400'}`} /> {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

interface ProductRow {
  id: number;
  productName: string;
  customerId: number | null;
  customerName: string | null;
  leadId: number | null;
  leadName: string | null;
  verticalId: number;
  verticalName: string;
  headId: number | null;
  headName: string | null;
  budget: string | null;
  budgetCurrencyCode: string | null;
  isActive: boolean;
}

async function fetchProducts(): Promise<ProductRow[]> {
  const res = await fetch('/api/products?includeInactive=true');
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { has } = usePermissions();
  const canManageQuotations = has('manage_quotations');
  const searchParams = useSearchParams();
  // Landed here from the Quotation form after saving a new Budget
  // Estimation (?expand=<productId>, set by that page's own post-save
  // redirect) — auto-open that product's panel so the estimation is
  // immediately visible. Same convention as Project Master's own
  // expandParam.
  const expandParam = searchParams.get('expand');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductFormState>(blankProductForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(expandParam ? parseInt(expandParam) : null);

  // Search — same debounced searchInput/search pattern as the other Master
  // modules (e.g. src/app/dashboard/packages/page.tsx), applied client-side
  // since this list (like Project's) has no server-side pagination to
  // re-fetch against.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: products = [], isLoading, isError } = useQuery({ queryKey: ['products-admin'], queryFn: fetchProducts });
  const filteredProducts = search
    ? products.filter((p) => {
        const term = search.trim().toLowerCase();
        return (
          p.productName.toLowerCase().includes(term) ||
          (p.customerName || '').toLowerCase().includes(term) ||
          (p.leadName || '').toLowerCase().includes(term) ||
          p.verticalName.toLowerCase().includes(term)
        );
      })
    : products;

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankProductForm); setFormErrors({}); };

  const openEdit = (p: ProductRow) => {
    setEditingId(p.id);
    setForm({
      productName: p.productName,
      customerId: p.customerId ? String(p.customerId) : '',
      leadId: p.leadId ? String(p.leadId) : '',
      verticalId: String(p.verticalId),
      headId: p.headId ? String(p.headId) : '',
      budget: p.budget || '',
    });
    setDrawerOpen(true);
  };

  const save = useMutation({
    mutationFn: async (data: ProductFormState) => {
      const url = editingId ? `/api/products/${editingId}` : '/api/products';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          customerId: data.customerId || null,
          leadId: data.leadId || null,
          headId: data.headId || null,
          budget: data.budget || null,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save product'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products-admin'] }); invalidateProductData(queryClient); toast.success(editingId ? 'Product updated' : 'Product created'); closeDrawer(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = isActive
        ? await fetch(`/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update product'); }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products-admin'] });
      invalidateProductData(queryClient);
      toast.success(variables.isActive ? 'Product reactivated' : 'Product deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Products</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Customer engagements grouped by vertical, with a responsible head and budget</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(blankProductForm); setDrawerOpen(true); }}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Search — same bordered-card placement above the table as the other
          Master modules. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product, customer, lead, vertical..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : isError ? (
          <p className="text-center py-16 text-red-500">Failed to load products. Please try refreshing the page.</p>
        ) : products.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No products created yet</p>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-medium text-slate-600">No products found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-2 py-3"></th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Product Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Lead</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vertical</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Head</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Budget</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, idx) => {
                  const budgetCurrency = p.budgetCurrencyCode || 'INR';
                  const budgetNum = p.budget != null ? Number(p.budget) : null;
                  const isExpanded = expandedId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                            title={isExpanded ? 'Hide Budget Estimations' : 'Show Budget Estimations'}
                          >
                            {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{p.productName}</td>
                        <td className="px-4 py-3 text-slate-600">{p.customerName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.leadName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.verticalName}</td>
                        <td className="px-4 py-3 text-slate-600">{p.headName || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{budgetNum != null ? formatCurrency(budgetNum, budgetCurrency) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {p.isActive ? 'Active' : 'Deleted'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RowActionsMenu
                            items={[
                              // Unlike Project Master's own "Budget Estimation" menu item
                              // (which just expands its accordion — see that page's own
                              // items array), this one navigates straight to the New
                              // Quotation form per the explicit product requirement — the
                              // chevron toggle below still opens the accordion to *view*
                              // existing estimations. Omitted entirely (not just disabled)
                              // when the user can't create quotations or the product is
                              // deleted, same gating as the panel's own "+ New Estimation".
                              ...(canManageQuotations && p.isActive
                                ? [{ key: 'analytics', label: 'Budget Estimation', icon: ChartBarIcon, onClick: () => router.push(`/dashboard/quotations?productId=${p.id}&leadId=${p.customerId ?? p.leadId}`) }]
                                : []),
                              { key: 'edit', label: 'Edit Product', icon: PencilIcon, onClick: () => openEdit(p) },
                              p.isActive
                                ? {
                                    key: 'delete',
                                    label: 'Delete Product',
                                    icon: TrashIcon,
                                    danger: true,
                                    onClick: () => { if (window.confirm(`Delete product "${p.productName}"?`)) toggleActive.mutate({ id: p.id, isActive: false }); },
                                  }
                                : { key: 'reactivate', label: 'Reactivate Product', icon: ArrowPathIcon, onClick: () => toggleActive.mutate({ id: p.id, isActive: true }) },
                            ]}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 border-t border-slate-100">
                            <ProductBudgetPanel
                              productId={p.id}
                              newEstimationHref={
                                canManageQuotations && p.isActive
                                  ? `/dashboard/quotations?productId=${p.id}&leadId=${p.customerId ?? p.leadId}`
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductFormDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editingId={editingId}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        setFormErrors={setFormErrors}
        onSave={(data) => save.mutate(data)}
        isSaving={save.isPending}
      />
    </div>
  );
}
