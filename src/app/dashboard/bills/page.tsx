'use client';

import { useState, useRef } from 'react';
import type { ReactNode, DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon, EyeIcon,
  XMarkIcon, DocumentArrowUpIcon, DocumentTextIcon, Cog6ToothIcon, BanknotesIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { generateBillPDF } from '@/lib/generateBillPDF';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { invalidateExpenseData } from '@/lib/queryInvalidation';
import AddableSelect from '@/components/AddableSelect';
import AttachmentUploadField from '@/components/AttachmentUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import { useScrollFormIntoView } from '@/hooks/useScrollFormIntoView';
import { computeBillItem, computeBillTotals, GSTIN_REGEX } from '@/lib/billCalc';

// Finance → Bills. Vendor invoices are keyed in manually (the PDF is only
// attached for reference); posting a bill auto-creates its linked Expense
// entry, whose status then follows the bill's payment status.

interface SubCategory { id: number; categoryId: number; name: string; gstType: string; tdsApplicable: boolean; tdsPercent: string }
interface Category { id: number; name: string; subCategories: SubCategory[] }
interface Supplier { id: number; name: string; gstin: string | null; address: string | null; phone: string | null; email: string | null }
interface BillRow {
  id: number;
  billNumber: string;
  billType: string;
  invoiceNumber: string;
  invoiceDate: string;
  categoryId: number;
  itemTotal: string;
  gstTotal: string;
  tdsTotal: string;
  payableAmount: string;
  status: string;
  paymentStatus: string;
  paidAmount: string;
  attachmentName: string | null;
  paymentProofUrl: string | null;
  paymentProofName: string | null;
  paymentMethod: string | null;
  supplier: { id: number; name: string; gstin: string | null };
  category: { name: string };
  expense: { id: number; expenseNumber: string; status: string } | null;
}
interface BillItemDetail {
  id: number; subCategoryId: number; description: string; itemValue: string;
  cgstRate: string; sgstRate: string; igstRate: string; cgstAmount: string; sgstAmount: string; igstAmount: string;
  gstAmount: string; gstType: string; tdsPercent: string; tdsAmount: string; payableAmount: string;
  subCategory: { name: string };
}
interface BillDetail extends BillRow {
  supplierId: number;
  cgstTotal: string; sgstTotal: string; igstTotal: string;
  paymentMethod: string | null; paidDate: string | null; notes: string | null; attachmentUrl: string | null;
  postedAt: string | null; createdAt: string;
  supplier: Supplier;
  items: BillItemDetail[];
  createdBy: { firstName: string; lastName: string } | null;
}
interface BillListResponse { content: BillRow[]; page: number; totalPages: number; totalElements: number }

const BILL_TYPE_LABELS: Record<string, string> = { SUB_CONTRACTOR: 'Sub-Contractor (Service)', MATERIAL: 'Material / Goods' };
// A bill's running payment figures, in whole paise so repeated partial
// payments add up exactly: payable, already paid, and what's left.
function billPaymentAmounts(b: { payableAmount: string; paidAmount: string; paymentStatus: string }) {
  const payable = Math.round(Number(b.payableAmount) * 100);
  const paid = b.paymentStatus === 'PAID' ? payable : Math.round(Number(b.paidAmount) * 100);
  return { payable: payable / 100, paid: paid / 100, remaining: Math.max(0, payable - paid) / 100 };
}
const PAYMENT_STATUS_LABELS: Record<string, string> = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' };
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PARTIALLY_PAID: 'bg-sky-100 text-sky-700',
  PAID: 'bg-green-100 text-green-700',
};
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UPI', 'OTHER'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
const errCls = 'border-red-400 focus:ring-red-400 focus:border-red-400';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

function Modal({ title, onClose, children, wide, actions }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; actions?: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-lg border border-slate-200 w-full ${wide ? 'max-w-4xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-4 sm:p-5`}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600"><XMarkIcon className="h-5 w-5" /></button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Request failed');
  return res.json();
}

interface ItemForm { key: number; subCategoryId: string; description: string; itemValue: string; cgstRate: string; sgstRate: string; igstRate: string; tdsPercent: string }
let itemKey = 0;
const blankItem = (): ItemForm => ({ key: ++itemKey, subCategoryId: '', description: '', itemValue: '', cgstRate: '', sgstRate: '', igstRate: '', tdsPercent: '' });
const blankForm = () => ({
  billType: 'SUB_CONTRACTOR',
  supplierId: '',
  invoiceNumber: '',
  invoiceDate: dayjs().format('YYYY-MM-DD'),
  categoryId: '',
  supplyType: 'INTRA' as 'INTRA' | 'INTER', // CGST+SGST vs IGST
  attachmentUrl: '',
  attachmentName: '',
  notes: '',
  items: [blankItem()],
});
type BillForm = ReturnType<typeof blankForm>;
const n = (v: string) => (v === '' || v == null ? 0 : Number(v) || 0);

export default function BillsPage() {
  const queryClient = useQueryClient();
  const { has, hasAny } = usePermissions();
  const canCreate = has('create_bills');
  const canEdit = has('edit_bills');
  const canDelete = has('delete_bills');
  // GST / TDS settings edit expense sub-categories, so they follow the
  // Expenses permissions (PUT → edit_expenses, POST → create_expenses).
  const canEditTax = has('edit_expenses');
  const canCreateTax = has('create_expenses');
  const canOpenTaxSettings = hasAny(['create_expenses', 'edit_expenses']);

  // ---- list state ----
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const size = 10;

  const listParams = new URLSearchParams({ page: String(page), size: String(size) });
  if (statusFilter) listParams.set('status', statusFilter);
  if (typeFilter) listParams.set('billType', typeFilter);
  const { data, isLoading } = useQuery({ queryKey: ['bills', listParams.toString()], queryFn: () => getJson<BillListResponse>(`/api/bills?${listParams}`) });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => getJson<Category[]>('/api/expenses/categories') });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => getJson<Supplier[]>('/api/suppliers') });

  const invalidateBills = () => {
    queryClient.invalidateQueries({ queryKey: ['bills'] });
    invalidateExpenseData(queryClient);
  };

  // ---- bill form ----
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BillForm>(blankForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { ref: formRef, trigger: scrollToForm } = useScrollFormIntoView<HTMLDivElement>();
  const clearError = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm()); setErrors({}); };

  const selectedCategory = categories.find((c) => c.id === Number(form.categoryId));
  const subCategoryById = new Map((selectedCategory?.subCategories || []).map((s) => [s.id, s]));
  const selectedSupplier = suppliers.find((s) => s.id === Number(form.supplierId));

  const setItem = (key: number, patch: Partial<ItemForm>) => setForm((f) => ({ ...f, items: f.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));
  const itemInputs = form.items.map((it) => ({
    itemValue: n(it.itemValue),
    cgstRate: form.supplyType === 'INTRA' ? n(it.cgstRate) : 0,
    sgstRate: form.supplyType === 'INTRA' ? n(it.sgstRate) : 0,
    igstRate: form.supplyType === 'INTER' ? n(it.igstRate) : 0,
    tdsPercent: n(it.tdsPercent),
  }));
  const totals = computeBillTotals(itemInputs);
  // GST figure per direction — the screen shows only the direction(s) that
  // apply to the chosen sub-categories (normally just Input GST).
  const gstByType: Record<string, number> = {};
  form.items.forEach((it, i) => {
    const sub = subCategoryById.get(Number(it.subCategoryId));
    if (!sub) return;
    gstByType[sub.gstType] = (gstByType[sub.gstType] || 0) + computeBillItem(itemInputs[i]).gstAmount;
  });

  const openEdit = async (id: number) => {
    try {
      const bill = await getJson<BillDetail>(`/api/bills/${id}`);
      const inter = bill.items.some((i) => Number(i.igstRate) > 0);
      setForm({
        billType: bill.billType,
        supplierId: String(bill.supplierId),
        invoiceNumber: bill.invoiceNumber,
        invoiceDate: dayjs(bill.invoiceDate).format('YYYY-MM-DD'),
        categoryId: String(bill.categoryId),
        supplyType: inter ? 'INTER' : 'INTRA',
        attachmentUrl: bill.attachmentUrl || '',
        attachmentName: bill.attachmentName || '',
        notes: bill.notes || '',
        items: bill.items.map((i) => ({
          key: ++itemKey,
          subCategoryId: String(i.subCategoryId),
          description: i.description,
          itemValue: String(Number(i.itemValue)),
          cgstRate: Number(i.cgstRate) ? String(Number(i.cgstRate)) : '',
          sgstRate: Number(i.sgstRate) ? String(Number(i.sgstRate)) : '',
          igstRate: Number(i.igstRate) ? String(Number(i.igstRate)) : '',
          tdsPercent: String(Number(i.tdsPercent)),
        })),
      });
      setEditingId(id);
      setErrors({});
      setShowForm(true);
      scrollToForm();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.supplierId) e.supplierId = 'Vendor is required';
    if (!form.invoiceNumber.trim()) e.invoiceNumber = 'Invoice number is required';
    if (!form.invoiceDate) e.invoiceDate = 'Invoice date is required';
    if (!form.categoryId) e.categoryId = 'Category is required';
    form.items.forEach((it) => {
      if (!it.subCategoryId) e[`item-${it.key}-subCategoryId`] = 'Required';
      if (!it.description.trim()) e[`item-${it.key}-description`] = 'Required';
      if (!(n(it.itemValue) > 0)) e[`item-${it.key}-itemValue`] = 'Must be > 0';
    });
    setErrors(e);
    if (Object.keys(e).length) toast.error('Please fill in the highlighted fields');
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: async ({ post }: { post: boolean }): Promise<any> => {
      const send = (allowDuplicate: boolean) => fetch(editingId ? `/api/bills/${editingId}` : '/api/bills', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, allowDuplicate }),
      });
      const payload = {
        billType: form.billType,
        supplierId: form.supplierId,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        categoryId: form.categoryId,
        attachmentUrl: form.attachmentUrl || null,
        attachmentName: form.attachmentName || null,
        notes: form.notes,
        items: form.items.map((it, i) => ({
          subCategoryId: it.subCategoryId,
          description: it.description,
          ...itemInputs[i],
        })),
        post,
      };
      let res = await send(false);
      let body = await res.json().catch(() => ({}));
      // FR-14: duplicate invoice from the same vendor is a warning, not a block.
      if (res.status === 409 && body.code === 'DUPLICATE_INVOICE') {
        if (!window.confirm(`${body.message}.\n\nSave anyway?`)) return { cancelled: true };
        res = await send(true);
        body = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw new Error(body.message || 'Failed to save bill');
      return { ...body, post };
    },
    onSuccess: (result) => {
      if (result?.cancelled) return;
      invalidateBills();
      toast.success(result.post ? `Bill ${result.billNumber} posted — expense entry created` : `Bill ${result.billNumber} saved as draft`);
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---- invoice PDF attachment (reference only) ----
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFile = async (file: File) => {
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) { toast.error('Only PDF invoices can be attached'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File exceeds the 10MB limit'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/bills/upload', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Upload failed');
      setForm((f) => ({ ...f, attachmentUrl: body.url, attachmentName: body.name }));
      toast.success('Invoice attached');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  // ---- vendor (supplier) inline create ----
  const [showVendorForm, setShowVendorForm] = useState(false);
  const blankVendor = { name: '', gstin: '', address: '', phone: '', email: '' };
  const [vendorForm, setVendorForm] = useState(blankVendor);
  const saveVendor = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vendorForm) });
      const body = await res.json();
      if (res.status === 409 && body.existing) {
        if (window.confirm(`${body.message}.\n\nUse the existing vendor?`)) return { ...body.existing, reused: true };
        throw new Error(body.message);
      }
      if (!res.ok) throw new Error(body.message || 'Failed to create vendor');
      return body;
    },
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setForm((f) => ({ ...f, supplierId: String(supplier.id) }));
      clearError('supplierId');
      toast.success(supplier.reused ? `Selected ${supplier.name}` : `Vendor ${supplier.name} created`);
      setShowVendorForm(false);
      setVendorForm(blankVendor);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const vendorGstinInvalid = !!vendorForm.gstin && !GSTIN_REGEX.test(vendorForm.gstin.trim().toUpperCase());

  // ---- view / payment / delete ----
  const [viewingId, setViewingId] = useState<number | null>(null);
  // PDF of the View popup — same fields, line items and totals.
  const exportBillPdf = (bill: BillDetail) => {
    generateBillPDF({
      billNumber: bill.billNumber,
      supplierName: bill.supplier.name,
      details: [
        { label: 'Bill Type', value: BILL_TYPE_LABELS[bill.billType] || bill.billType },
        { label: 'Vendor GSTIN', value: bill.supplier.gstin || '—' },
        { label: 'Invoice', value: `${bill.invoiceNumber} · ${dayjs(bill.invoiceDate).format('DD MMM YYYY')}` },
        { label: 'Category', value: bill.category.name },
        { label: 'Status', value: bill.status === 'DRAFT' ? 'Draft' : `Posted ${bill.postedAt ? dayjs(bill.postedAt).format('DD MMM YYYY') : ''}`.trim() },
        { label: 'Payment', value: bill.status === 'POSTED' ? `${PAYMENT_STATUS_LABELS[bill.paymentStatus]}${bill.paymentStatus === 'PARTIALLY_PAID' ? ` (${formatCurrency(bill.paidAmount, 'INR')})` : ''}` : '—' },
        { label: 'Expense Entry', value: bill.expense?.expenseNumber || '—' },
        { label: 'Invoice PDF', value: bill.attachmentName || '—' },
      ],
      items: bill.items.map((i) => ({
        subCategory: i.subCategory.name,
        description: i.description,
        itemValue: Number(i.itemValue),
        cgstAmount: Number(i.cgstAmount), cgstRate: Number(i.cgstRate),
        sgstAmount: Number(i.sgstAmount), sgstRate: Number(i.sgstRate),
        igstAmount: Number(i.igstAmount), igstRate: Number(i.igstRate),
        gstAmount: Number(i.gstAmount),
        gstType: i.gstType,
        tdsAmount: Number(i.tdsAmount), tdsPercent: Number(i.tdsPercent),
        payableAmount: Number(i.payableAmount),
      })),
      itemTotal: Number(bill.itemTotal),
      gstTotal: Number(bill.gstTotal),
      tdsTotal: Number(bill.tdsTotal),
      payableAmount: Number(bill.payableAmount),
      partialPayment: bill.status === 'POSTED' && bill.paymentStatus === 'PARTIALLY_PAID'
        ? { paid: Number(bill.paidAmount), remaining: Math.max(0, Number(bill.payableAmount) - Number(bill.paidAmount)) }
        : null,
      notes: bill.notes,
      fileName: `${bill.billNumber}.pdf`,
    });
  };
  const { data: viewing } = useQuery({ queryKey: ['bill', viewingId], queryFn: () => getJson<BillDetail>(`/api/bills/${viewingId}`), enabled: viewingId !== null });

  const [paymentBill, setPaymentBill] = useState<BillRow | null>(null);
  // payAmount is THIS payment only — the API adds it to what's already paid.
  const [paymentForm, setPaymentForm] = useState({ payAmount: '', paymentMethod: 'BANK_TRANSFER', paidDate: dayjs().format('YYYY-MM-DD') });
  // Supporting document for the payment — starts from the one already saved.
  const [paymentProof, setPaymentProof] = useState<{ url: string; name: string } | null>(null);
  const [paymentProofUploading, setPaymentProofUploading] = useState(false);
  const openPayment = (b: BillRow) => {
    setPaymentBill(b);
    setPaymentProof(b.paymentProofUrl ? { url: b.paymentProofUrl, name: b.paymentProofName || 'Payment proof' } : null);
    // Defaults to paying off the whole remaining balance.
    const remaining = billPaymentAmounts(b).remaining;
    setPaymentForm({
      payAmount: remaining > 0 ? remaining.toFixed(2) : '',
      paymentMethod: b.paymentMethod || 'BANK_TRANSFER',
      paidDate: dayjs().format('YYYY-MM-DD'),
    });
  };
  const savePayment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bills/${paymentBill!.id}/payment`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...paymentForm, paymentProofUrl: paymentProof?.url ?? null, paymentProofName: paymentProof?.name ?? null }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Failed to update payment status');
      return body;
    },
    onSuccess: () => { invalidateBills(); toast.success('Payment recorded'); setPaymentBill(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/bills/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to delete bill');
    },
    onSuccess: () => { invalidateBills(); toast.success('Bill deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---- sub-category tax settings (GST type / TDS %) ----
  const [showTaxSettings, setShowTaxSettings] = useState(false);
  const [taxCategoryId, setTaxCategoryId] = useState('');
  const [taxDrafts, setTaxDrafts] = useState<Record<number, { gstType: string; tdsApplicable: boolean; tdsPercent: string }>>({});
  const [newSub, setNewSub] = useState({ name: '', gstType: 'INPUT', tdsApplicable: false, tdsPercent: '' });
  const taxCategory = categories.find((c) => c.id === Number(taxCategoryId));
  const openTaxSettings = () => { setTaxCategoryId(form.categoryId || (categories[0] ? String(categories[0].id) : '')); setTaxDrafts({}); setShowTaxSettings(true); };
  const draftFor = (s: SubCategory) => taxDrafts[s.id] || { gstType: s.gstType, tdsApplicable: s.tdsApplicable, tdsPercent: String(Number(s.tdsPercent)) };
  const saveTax = useMutation({
    mutationFn: async (s: SubCategory) => {
      const d = draftFor(s);
      const res = await fetch(`/api/expenses/sub-categories/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: s.name, ...d }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Failed to save');
      return body;
    },
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setTaxDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => Number(k) !== s.id)));
      toast.success(`Saved "${s.name}"`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const addSub = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/expenses/sub-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: taxCategoryId, ...newSub }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Failed to add sub-category');
      return body;
    },
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setNewSub({ name: '', gstType: 'INPUT', tdsApplicable: false, tdsPercent: '' });
      toast.success(`Sub-category "${s.name}" added`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bills = data?.content || [];
  const totalPages = data?.totalPages || 0;
  const locked = save.isPending || uploading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Bills</h1>
        </div>
        {(canOpenTaxSettings || canCreate) && (
          <div className="flex flex-wrap gap-2">
            {canOpenTaxSettings && (
              <button onClick={openTaxSettings} className="flex items-center gap-2 px-4 py-2 min-h-[44px] border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                <Cog6ToothIcon className="h-4 w-4" /> GST / TDS Settings
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => { if (showForm) closeForm(); else { setForm(blankForm()); setShowForm(true); scrollToForm(); } }}
                className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                <PlusIcon className="h-4 w-4" /> New Bill
              </button>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div ref={formRef} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">{editingId ? 'Edit Draft Bill' : 'New Bill'}</h2>
            <button type="button" onClick={closeForm} className="p-1 rounded text-slate-400 hover:text-slate-600"><XMarkIcon className="h-5 w-5" /></button>
          </div>

          {/* Bill type */}
          <div>
            <span className={labelCls}>Bill Type</span>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
              {Object.entries(BILL_TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billType: value }))}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${form.billType === value ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Vendor *</label>
              <AddableSelect
                value={form.supplierId}
                onChange={(v) => { setForm((f) => ({ ...f, supplierId: v })); clearError('supplierId'); }}
                options={suppliers.map((s) => ({ value: String(s.id), label: s.gstin ? `${s.name} (${s.gstin})` : s.name }))}
                placeholder="Select vendor"
                onAdd={canCreate ? () => { setVendorForm(blankVendor); setShowVendorForm(true); } : undefined}
                addLabel="Add Vendor"
                error={!!errors.supplierId}
              />
              {errors.supplierId && <p className="text-xs text-red-600 mt-1">{errors.supplierId}</p>}
            </div>
            <div>
              <label className={labelCls}>Vendor GSTIN</label>
              <input value={selectedSupplier?.gstin || ''} readOnly placeholder="—" className={`${inputCls} bg-slate-50 text-slate-500`} />
            </div>
            <div>
              <label className={labelCls}>Invoice Number *</label>
              <input value={form.invoiceNumber} onChange={(e) => { setForm((f) => ({ ...f, invoiceNumber: e.target.value })); clearError('invoiceNumber'); }} placeholder="e.g. INV-1042" className={`${inputCls} ${errors.invoiceNumber ? errCls : ''}`} />
              {errors.invoiceNumber && <p className="text-xs text-red-600 mt-1">{errors.invoiceNumber}</p>}
            </div>
            <div>
              <label className={labelCls}>Invoice Date *</label>
              <input type="date" value={form.invoiceDate} onChange={(e) => { setForm((f) => ({ ...f, invoiceDate: e.target.value })); clearError('invoiceDate'); }} className={`${inputCls} ${errors.invoiceDate ? errCls : ''}`} />
              {errors.invoiceDate && <p className="text-xs text-red-600 mt-1">{errors.invoiceDate}</p>}
            </div>
            <div>
              <label className={labelCls}>Category * <span className="font-normal text-slate-400">(one per bill)</span></label>
              <AddableSelect
                value={form.categoryId}
                // Line sub-categories belong to the category, so a change clears them.
                onChange={(v) => { setForm((f) => ({ ...f, categoryId: v, items: f.items.map((it) => ({ ...it, subCategoryId: '' })) })); clearError('categoryId'); }}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Select category"
                error={!!errors.categoryId}
              />
              {errors.categoryId && <p className="text-xs text-red-600 mt-1">{errors.categoryId}</p>}
            </div>
            <div>
              <label className={labelCls}>Supply Type</label>
              <AddableSelect
                value={form.supplyType}
                onChange={(v) => setForm((f) => ({ ...f, supplyType: v as 'INTRA' | 'INTER' }))}
                options={[{ value: 'INTRA', label: 'Intra-state (CGST + SGST)' }, { value: 'INTER', label: 'Inter-state (IGST)' }]}
                placeholder="Select supply type"
                clearable={false}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Invoice PDF <span className="font-normal text-slate-400">(for reference)</span></label>
              {form.attachmentUrl ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <DocumentTextIcon className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="truncate text-slate-700">{form.attachmentName}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, attachmentUrl: '', attachmentName: '' }))} className="ml-auto text-slate-400 hover:text-red-600" title="Remove">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] border-2 border-dashed rounded-lg text-sm cursor-pointer ${dragOver ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-500 hover:border-amber-400'}`}
                >
                  <DocumentArrowUpIcon className="h-5 w-5" />
                  {uploading ? 'Uploading…' : 'Drag & drop the invoice PDF, or click to browse'}
                  <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
              {!form.categoryId && <span className="text-xs text-slate-400">Select a category to pick sub-categories</span>}
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold min-w-[160px]">Sub Category *</th>
                    <th className="px-2 py-2 text-left font-semibold min-w-[180px]">Item Description *</th>
                    <th className="px-2 py-2 text-right font-semibold min-w-[110px]">Item Value *</th>
                    {form.supplyType === 'INTRA' ? (
                      <>
                        <th className="px-2 py-2 text-right font-semibold w-20">CGST %</th>
                        <th className="px-2 py-2 text-right font-semibold w-20">SGST %</th>
                      </>
                    ) : (
                      <th className="px-2 py-2 text-right font-semibold w-20">IGST %</th>
                    )}
                    <th className="px-2 py-2 text-right font-semibold min-w-[100px]">GST</th>
                    <th className="px-2 py-2 text-right font-semibold w-20">TDS %</th>
                    <th className="px-2 py-2 text-right font-semibold min-w-[90px]">TDS</th>
                    <th className="px-2 py-2 text-right font-semibold min-w-[110px]">Payable</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => {
                    const c = computeBillItem(itemInputs[i]);
                    const sub = subCategoryById.get(Number(it.subCategoryId));
                    const rateInput = (field: 'cgstRate' | 'sgstRate' | 'igstRate' | 'tdsPercent') => (
                      <input type="number" min="0" max="100" step="0.01" value={it[field]} onChange={(e) => setItem(it.key, { [field]: e.target.value })} className={`${inputCls} text-right px-2`} placeholder="0" />
                    );
                    return (
                      <tr key={it.key} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-2">
                          <AddableSelect
                            value={it.subCategoryId}
                            disabled={!selectedCategory}
                            onChange={(v) => {
                              const s = subCategoryById.get(Number(v));
                              // Default the line's TDS % from the sub-category.
                              setItem(it.key, { subCategoryId: v, tdsPercent: s ? String(s.tdsApplicable ? Number(s.tdsPercent) : 0) : it.tdsPercent });
                              clearError(`item-${it.key}-subCategoryId`);
                            }}
                            options={(selectedCategory?.subCategories || []).map((s) => ({ value: String(s.id), label: s.name }))}
                            placeholder="Select…"
                            error={!!errors[`item-${it.key}-subCategoryId`]}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input value={it.description} onChange={(e) => { setItem(it.key, { description: e.target.value }); clearError(`item-${it.key}-description`); }} placeholder="Service / material" className={`${inputCls} px-2 ${errors[`item-${it.key}-description`] ? errCls : ''}`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="0" step="0.01" value={it.itemValue} onChange={(e) => { setItem(it.key, { itemValue: e.target.value }); clearError(`item-${it.key}-itemValue`); }} placeholder="0.00" className={`${inputCls} text-right px-2 ${errors[`item-${it.key}-itemValue`] ? errCls : ''}`} />
                        </td>
                        {form.supplyType === 'INTRA' ? (
                          <>
                            <td className="px-2 py-2">{rateInput('cgstRate')}</td>
                            <td className="px-2 py-2">{rateInput('sgstRate')}</td>
                          </>
                        ) : (
                          <td className="px-2 py-2">{rateInput('igstRate')}</td>
                        )}
                        <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">
                          {formatCurrency(c.gstAmount, 'INR')}
                          {sub && <span className={`block text-[10px] font-semibold uppercase ${sub.gstType === 'OUTPUT' ? 'text-rose-600' : 'text-emerald-600'}`}>{sub.gstType === 'OUTPUT' ? 'Output GST' : 'Input GST'}</span>}
                        </td>
                        <td className="px-2 py-2">{rateInput('tdsPercent')}</td>
                        <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">{formatCurrency(c.tdsAmount, 'INR')}</td>
                        <td className="px-2 py-2 text-right font-medium text-slate-800 whitespace-nowrap">{formatCurrency(c.payableAmount, 'INR')}</td>
                        <td className="px-2 py-2">
                          {form.items.length > 1 && (
                            <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== it.key) }))} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove line">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))} className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">
              <PlusIcon className="h-4 w-4" /> Add line item
            </button>
          </div>

          {/* Notes + totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="Optional" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-600">Item Value</span><span className="text-slate-800">{formatCurrency(totals.itemTotal, 'INR')}</span></div>
              {form.supplyType === 'INTRA' ? (
                <>
                  <div className="flex justify-between text-xs"><span className="text-slate-500 pl-3">CGST</span><span className="text-slate-600">{formatCurrency(totals.cgstTotal, 'INR')}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500 pl-3">SGST</span><span className="text-slate-600">{formatCurrency(totals.sgstTotal, 'INR')}</span></div>
                </>
              ) : (
                <div className="flex justify-between text-xs"><span className="text-slate-500 pl-3">IGST</span><span className="text-slate-600">{formatCurrency(totals.igstTotal, 'INR')}</span></div>
              )}
              {Object.keys(gstByType).length > 0 ? (
                Object.entries(gstByType).map(([type, amt]) => (
                  <div key={type} className="flex justify-between"><span className="text-slate-600">+ {type === 'OUTPUT' ? 'Output GST' : 'Input GST'}</span><span className="text-slate-800">{formatCurrency(amt, 'INR')}</span></div>
                ))
              ) : (
                <div className="flex justify-between"><span className="text-slate-600">+ GST</span><span className="text-slate-800">{formatCurrency(totals.gstTotal, 'INR')}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-600">− TDS</span><span className="text-slate-800">{formatCurrency(totals.tdsTotal, 'INR')}</span></div>
              <div className="flex justify-between border-t border-slate-300 pt-2 mt-2 text-base font-semibold">
                <span className="text-slate-800">Net Payable</span><span className="text-amber-700">{formatCurrency(totals.payableAmount, 'INR')}</span>
              </div>
              <p className="text-[11px] text-slate-400">Payable = Item Value − TDS + GST</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="button" disabled={locked} onClick={() => { if (validate()) save.mutate({ post: false }); }} className="px-4 py-2 min-h-[40px] border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
              Save as Draft
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => { if (validate() && window.confirm('Post this bill? Posted bills are locked and a linked expense entry is created.')) save.mutate({ post: true }); }}
              className="px-4 py-2 min-h-[40px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Post Bill'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          {[['', 'All'], ['DRAFT', 'Draft'], ['POSTED', 'Posted']].map(([value, label]) => (
            <button key={value} onClick={() => { setStatusFilter(value); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === value ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="w-56">
              <AddableSelect
                value={typeFilter}
                onChange={(v) => { setTypeFilter(v); setPage(0); }}
                options={Object.entries(BILL_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                placeholder="All Bill Types"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : bills.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No bills found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Bill</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vendor</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Category</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Item Value</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">GST</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">TDS</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Payable</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b, idx) => (
                  <tr key={b.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{b.billNumber}</p>
                      <p className="text-xs text-slate-400">{b.invoiceNumber} · {dayjs(b.invoiceDate).format('DD MMM YYYY')}</p>
                      <span className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 w-fit">{b.billType === 'SUB_CONTRACTOR' ? 'Sub-Contractor' : 'Material'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{b.supplier.name}</p>
                      {b.supplier.gstin && <p className="text-xs text-slate-400">{b.supplier.gstin}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.category.name}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.itemTotal, 'INR')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.gstTotal, 'INR')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.tdsTotal, 'INR')}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(b.payableAmount, 'INR')}</td>
                    <td className="px-4 py-3">
                      {b.status === 'DRAFT' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700">Draft</span>
                      ) : (
                        <>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_COLORS[b.paymentStatus]}`}>{PAYMENT_STATUS_LABELS[b.paymentStatus]}</span>
                          {b.paymentStatus === 'PARTIALLY_PAID' && <p className="text-xs text-slate-400 mt-1">{formatCurrency(b.paidAmount, 'INR')} paid</p>}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        <button onClick={() => setViewingId(b.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View"><EyeIcon className="h-4 w-4" /></button>
                        {canEdit && b.status === 'DRAFT' && (
                          <button onClick={() => openEdit(b.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                        )}
                        {canEdit && b.status === 'POSTED' && (
                          <button onClick={() => openPayment(b)} className="p-1.5 rounded text-slate-400 hover:text-green-700 hover:bg-green-50" title="Update payment status"><BanknotesIcon className="h-4 w-4" /></button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => { if (window.confirm(`Delete bill ${b.billNumber}?${b.status === 'POSTED' ? ' Its linked expense entry will also be removed.' : ''}`)) remove.mutate(b.id); }}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
            <span>{data?.totalElements} bills</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeftIcon className="h-4 w-4" /></button>
              <span>Page {page + 1} of {totalPages}</span>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRightIcon className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Add Vendor */}
      {showVendorForm && (
        <Modal title="Add Vendor" onClose={() => setShowVendorForm(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!vendorForm.name.trim()) { toast.error('Vendor name is required'); return; }
              if (vendorGstinInvalid) { toast.error('GSTIN format is invalid'); return; }
              saveVendor.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className={labelCls}>Vendor / Company Name *</label>
              <input value={vendorForm.name} onChange={(e) => setVendorForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} autoFocus />
            </div>
            <div>
              <label className={labelCls}>GSTIN</label>
              <input value={vendorForm.gstin} onChange={(e) => setVendorForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} maxLength={15} placeholder="33AAAAA0000A1Z5" className={`${inputCls} ${vendorGstinInvalid ? errCls : ''}`} />
              {vendorGstinInvalid && <p className="text-xs text-red-600 mt-1">Expected 15 characters, e.g. 33AAAAA0000A1Z5</p>}
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <textarea rows={2} value={vendorForm.address} onChange={(e) => setVendorForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Phone</label>
                <input value={vendorForm.phone} onChange={(e) => setVendorForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={vendorForm.email} onChange={(e) => setVendorForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowVendorForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveVendor.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveVendor.isPending ? 'Saving…' : 'Add Vendor'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View bill */}
      {viewingId !== null && (
        <Modal
          title={viewing ? `${viewing.billNumber} — ${viewing.supplier.name}` : 'Bill'}
          onClose={() => setViewingId(null)}
          wide
          actions={viewing && (
            <button type="button" onClick={() => exportBillPdf(viewing)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
              <ArrowDownTrayIcon className="h-4 w-4" /> Export
            </button>
          )}
        >
          {!viewing ? (
            <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><p className="text-xs text-slate-500">Bill Type</p><p className="text-slate-800">{BILL_TYPE_LABELS[viewing.billType]}</p></div>
                <div><p className="text-xs text-slate-500">Vendor GSTIN</p><p className="text-slate-800">{viewing.supplier.gstin || '—'}</p></div>
                <div><p className="text-xs text-slate-500">Invoice</p><p className="text-slate-800">{viewing.invoiceNumber} · {dayjs(viewing.invoiceDate).format('DD MMM YYYY')}</p></div>
                <div><p className="text-xs text-slate-500">Category</p><p className="text-slate-800">{viewing.category.name}</p></div>
                <div><p className="text-xs text-slate-500">Status</p><p className="text-slate-800">{viewing.status === 'DRAFT' ? 'Draft' : `Posted ${viewing.postedAt ? dayjs(viewing.postedAt).format('DD MMM YYYY') : ''}`}</p></div>
                <div><p className="text-xs text-slate-500">Payment</p><p className="text-slate-800">{viewing.status === 'POSTED' ? `${PAYMENT_STATUS_LABELS[viewing.paymentStatus]}${viewing.paymentStatus === 'PARTIALLY_PAID' ? ` (${formatCurrency(viewing.paidAmount, 'INR')})` : ''}` : '—'}</p></div>
                <div><p className="text-xs text-slate-500">Expense Entry</p><p className="text-slate-800">{viewing.expense?.expenseNumber || '—'}</p></div>
                <div>
                  <p className="text-xs text-slate-500">Invoice PDF</p>
                  {viewing.attachmentUrl ? (
                    <a href={`/api/bills/${viewing.id}/file`} target="_blank" rel="noreferrer" className="text-amber-700 hover:text-amber-800 font-medium truncate block">{viewing.attachmentName || 'View'}</a>
                  ) : <p className="text-slate-800">—</p>}
                </div>
                {viewing.paymentProofUrl && (
                  <div>
                    <p className="text-xs text-slate-500">Payment Proof</p>
                    <a href={`/api/bills/${viewing.id}/file?type=payment-proof`} target="_blank" rel="noreferrer" className="text-amber-700 hover:text-amber-800 font-medium truncate block">{viewing.paymentProofName || 'View'}</a>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">Sub Category</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-right">Item Value</th>
                      <th className="px-2 py-2 text-right">CGST</th>
                      <th className="px-2 py-2 text-right">SGST</th>
                      <th className="px-2 py-2 text-right">IGST</th>
                      <th className="px-2 py-2 text-right">GST</th>
                      <th className="px-2 py-2 text-right">TDS</th>
                      <th className="px-2 py-2 text-right">Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.items.map((i) => (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">{i.subCategory.name}</td>
                        <td className="px-2 py-2">{i.description}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(i.itemValue, 'INR')}</td>
                        <td className="px-2 py-2 text-right">{Number(i.cgstRate) ? `${formatCurrency(i.cgstAmount, 'INR')} (${Number(i.cgstRate)}%)` : '—'}</td>
                        <td className="px-2 py-2 text-right">{Number(i.sgstRate) ? `${formatCurrency(i.sgstAmount, 'INR')} (${Number(i.sgstRate)}%)` : '—'}</td>
                        <td className="px-2 py-2 text-right">{Number(i.igstRate) ? `${formatCurrency(i.igstAmount, 'INR')} (${Number(i.igstRate)}%)` : '—'}</td>
                        <td className="px-2 py-2 text-right">
                          {formatCurrency(i.gstAmount, 'INR')}
                          <span className={`block text-[10px] font-semibold uppercase ${i.gstType === 'OUTPUT' ? 'text-rose-600' : 'text-emerald-600'}`}>{i.gstType === 'OUTPUT' ? 'Output' : 'Input'}</span>
                        </td>
                        <td className="px-2 py-2 text-right">{formatCurrency(i.tdsAmount, 'INR')} ({Number(i.tdsPercent)}%)</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(i.payableAmount, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">Item Value</span><span>{formatCurrency(viewing.itemTotal, 'INR')}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">+ GST</span><span>{formatCurrency(viewing.gstTotal, 'INR')}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">− TDS</span><span>{formatCurrency(viewing.tdsTotal, 'INR')}</span></div>
                  <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold"><span>Net Payable</span><span className="text-amber-700">{formatCurrency(viewing.payableAmount, 'INR')}</span></div>
                  {/* Partially Paid: what's been paid and the balance still owed. */}
                  {viewing.status === 'POSTED' && viewing.paymentStatus === 'PARTIALLY_PAID' && (
                    <>
                      <div className="flex justify-between pt-1"><span className="text-slate-600">Paid</span><span>{formatCurrency(viewing.paidAmount, 'INR')}</span></div>
                      <div className="flex justify-between font-semibold"><span className="text-slate-800">Remaining</span><span className="text-amber-700">{formatCurrency(Math.max(0, Number(viewing.payableAmount) - Number(viewing.paidAmount)), 'INR')}</span></div>
                    </>
                  )}
                </div>
              </div>
              {viewing.notes && <p className="text-slate-600"><span className="text-xs text-slate-500 block">Notes</span>{viewing.notes}</p>}
            </div>
          )}
        </Modal>
      )}

      {/* Payment status */}
      {paymentBill && (
        <Modal title={`Payment — ${paymentBill.billNumber}`} onClose={() => setPaymentBill(null)}>
          {(() => {
            const { payable, paid, remaining } = billPaymentAmounts(paymentBill);
            const pay = Math.round((Number(paymentForm.payAmount) || 0) * 100) / 100;
            const payError = paymentForm.payAmount === '' ? 'Enter the amount being paid'
              : pay <= 0 ? 'Pay amount must be greater than 0'
              : pay > remaining ? `Cannot exceed the remaining amount (${formatCurrency(remaining, 'INR')})`
              : null;
            return (
              <form onSubmit={(e) => { e.preventDefault(); if (!payError) savePayment.mutate(); }} className="space-y-3 text-sm">
                {/* Total, what's been paid before this payment, and the balance. */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">Total Bill Amount</span><span className="font-semibold text-slate-800">{formatCurrency(payable, 'INR')}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Already Paid</span><span className="text-slate-800">{formatCurrency(paid, 'INR')}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <span className="font-medium text-slate-800">Remaining Amount</span>
                    <span className={`font-semibold ${remaining > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatCurrency(remaining, 'INR')}</span>
                  </div>
                </div>

                {remaining <= 0 ? (
                  <>
                    <p className="rounded-lg bg-green-50 px-3 py-2 text-green-700">This bill is fully paid.</p>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => setPaymentBill(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>Pay Amount *</label>
                      <input
                        type="number"
                        min="0.01"
                        max={remaining}
                        step="0.01"
                        value={paymentForm.payAmount}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, payAmount: e.target.value }))}
                        className={`${inputCls} ${payError && paymentForm.payAmount !== '' ? errCls : ''}`}
                      />
                      {payError && paymentForm.payAmount !== '' && <p className="mt-1 text-xs text-red-600">{payError}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Payment Method</label>
                        <AddableSelect
                          value={paymentForm.paymentMethod}
                          onChange={(v) => setPaymentForm((f) => ({ ...f, paymentMethod: v }))}
                          options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))}
                          placeholder="Select Payment Method"
                          inline
                          clearable={false}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Payment Date</label>
                        <input type="date" value={paymentForm.paidDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paidDate: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <AttachmentUploadField
                      label="Supporting Document / Receipt"
                      uploadUrl="/api/bills/upload?kind=payment-proof"
                      value={paymentProof}
                      onChange={setPaymentProof}
                      onUploadingChange={setPaymentProofUploading}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setPaymentBill(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={savePayment.isPending || paymentProofUploading || !!payError} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {savePayment.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            );
          })()}
        </Modal>
      )}

      {/* GST / TDS settings per sub-category */}
      {showTaxSettings && (
        <Modal title="GST / TDS Settings" onClose={() => setShowTaxSettings(false)} wide>
          <div className="space-y-4 text-sm">
            <div className="w-64">
              <label className={labelCls}>Category</label>
              <AddableSelect
                value={taxCategoryId}
                onChange={(v) => { setTaxCategoryId(v); setTaxDrafts({}); }}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Select category"
                clearable={false}
              />
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Sub Category</th>
                    <th className="px-3 py-2 text-left">GST Type</th>
                    <th className="px-3 py-2 text-left">TDS Applicable</th>
                    <th className="px-3 py-2 text-left">TDS %</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(taxCategory?.subCategories || []).map((s) => {
                    const d = draftFor(s);
                    const dirty = !!taxDrafts[s.id];
                    const setD = (patch: Partial<typeof d>) => setTaxDrafts((all) => ({ ...all, [s.id]: { ...d, ...patch } }));
                    return (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{s.name}</td>
                        <td className="px-3 py-2">
                          <div className="w-36">
                            <AddableSelect value={d.gstType} onChange={(v) => setD({ gstType: v })} options={[{ value: 'INPUT', label: 'Input GST' }, { value: 'OUTPUT', label: 'Output GST' }]} placeholder="GST type" clearable={false} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={d.tdsApplicable} onChange={(e) => setD({ tdsApplicable: e.target.checked, tdsPercent: e.target.checked ? d.tdsPercent : '0' })} className="h-4 w-4 accent-amber-600" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" max="100" step="0.01" disabled={!d.tdsApplicable} value={d.tdsPercent} onChange={(e) => setD({ tdsPercent: e.target.value })} className={`${inputCls} w-24 disabled:bg-slate-50`} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canEditTax && (
                            <button type="button" disabled={!dirty || saveTax.isPending} onClick={() => saveTax.mutate(s)} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40">Save</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {taxCategory && canCreateTax && (
                    <tr className="border-t border-slate-200 bg-amber-50/40">
                      <td className="px-3 py-2"><input value={newSub.name} onChange={(e) => setNewSub((f) => ({ ...f, name: e.target.value }))} placeholder="New sub-category" className={inputCls} /></td>
                      <td className="px-3 py-2">
                        <div className="w-36">
                          <AddableSelect value={newSub.gstType} onChange={(v) => setNewSub((f) => ({ ...f, gstType: v }))} options={[{ value: 'INPUT', label: 'Input GST' }, { value: 'OUTPUT', label: 'Output GST' }]} placeholder="GST type" clearable={false} />
                        </div>
                      </td>
                      <td className="px-3 py-2"><input type="checkbox" checked={newSub.tdsApplicable} onChange={(e) => setNewSub((f) => ({ ...f, tdsApplicable: e.target.checked }))} className="h-4 w-4 accent-amber-600" /></td>
                      <td className="px-3 py-2"><input type="number" min="0" max="100" step="0.01" disabled={!newSub.tdsApplicable} value={newSub.tdsPercent} onChange={(e) => setNewSub((f) => ({ ...f, tdsPercent: e.target.value }))} className={`${inputCls} w-24 disabled:bg-slate-50`} /></td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" disabled={!newSub.name.trim() || addSub.isPending} onClick={() => addSub.mutate()} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40">Add</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
