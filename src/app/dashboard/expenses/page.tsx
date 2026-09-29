'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon, EllipsisVerticalIcon, FunnelIcon, PaperClipIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { invalidateExpenseData } from '@/lib/queryInvalidation';
import AddableSelect from '@/components/AddableSelect';
import AttachmentUploadField from '@/components/AttachmentUploadField';
import { useScrollFormIntoView } from '@/hooks/useScrollFormIntoView';
import { usePermissions } from '@/hooks/usePermissions';

interface ExpenseSubCategory { id: number; categoryId: number; name: string; isActive: boolean; gstType: string; tdsApplicable: boolean; tdsPercent: string }
interface ExpenseCategory { id: number; name: string; description: string | null; isActive: boolean; subCategories: ExpenseSubCategory[] }
interface CurrencyOption { currencyCode: string }
// Vendor dropdown source — Customer module reuses Lead rows (status
// CONFIRMED) rather than a separate customer table, same convention as
// src/app/dashboard/customers/page.tsx and the leadId dropdown in
// InvoiceListPage.tsx.
interface CustomerOption { id: number; companyName: string; contactPerson: string }
// Project dropdown source, shown only when the "Project Expense" toggle is
// selected — same GET /api/projects (default isActive: true) used by the
// Lead/Demo project pickers.
interface ProjectOption { id: number; projectName: string }
// Same, for the "Product Expense" toggle — GET /api/products (default
// isActive: true).
interface ProductOption { id: number; productName: string }
interface ExpenseRow {
  id: number;
  expenseNumber: string;
  categoryId: number;
  categoryName: string;
  subCategoryId: number | null;
  subCategoryName: string | null;
  vendor: string | null;
  vendorLeadId: number | null;
  projectId: number | null;
  productId: number | null;
  expenseDate: string;
  amount: string;
  currencyCode: string;
  exchangeRate: string;
  paymentMethod: string;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  status: string;
  paidDate: string | null;
  referenceNumber: string | null;
  notes: string | null;
  recordedByName: string | null;
  source: string; // MANUAL | SALARY | REIMBURSEMENT | BILL
  // Only for BILL expenses — the posted vendor bill it came from.
  bill: {
    billId: number; billNumber: string; paymentStatus: string; paidAmount: string; status: string;
    billType: string; invoiceNumber: string; invoiceDate: string; supplierName: string;
    itemTotal: string; gstTotal: string; tdsTotal: string; payableAmount: string;
  } | null;
  // Only for REIMBURSEMENT expenses — the source claim, shown inline.
  reimbursement: {
    claimId: number; claimStatus: string; claimDate: string; description: string; amount: string; attachmentName: string | null;
    submittedAt: string | null; approvedAt: string | null; paidAt: string | null; paymentType: string | null; paymentProofName: string | null;
    employeeName: string; employeeCode: string; customerName: string | null; projectName: string | null; productName: string | null;
  } | null;
  // Only for SALARY expenses — one per approved Payroll Run; employees are
  // that run's payslips, shown in the row's "Employee Details" accordion.
  payroll: {
    runId: number; payPeriodYear: number; payPeriodMonth: number; runStatus: string;
    employees: {
      payslipId: number; employeeName: string; employeeCode: string; department: string | null; designation: string | null;
      totalDays: number; payableDays: string; lopDays: string; grossEarnings: string; totalDeductions: string; netPay: string;
    }[];
  } | null;
}
interface ExpenseListResponse { content: ExpenseRow[]; page: number; totalPages: number; totalElements: number; totalAmount: number }

// Page numbers with ellipsis, e.g. 1 2 3 4 … 10
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PROCESSED: 'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-sky-100 text-sky-700',
  PAID: 'bg-green-100 text-green-700',
};
// Same labels as the Bills page (src/app/dashboard/bills/page.tsx).
const BILL_TYPE_LABELS: Record<string, string> = { SUB_CONTRACTOR: 'Sub-Contractor (Service)', MATERIAL: 'Material / Goods' };
// Balance still owed on a bill: none once Paid, the full payable while
// Unpaid, payable − paid so far while Partially Paid.
function billRemaining(bill: { paymentStatus: string; payableAmount: string; paidAmount: string }): number {
  if (bill.paymentStatus === 'PAID') return 0;
  if (bill.paymentStatus === 'UNPAID') return Number(bill.payableAmount);
  return Math.max(0, Number(bill.payableAmount) - Number(bill.paidAmount));
}
const BILL_PAYMENT_LABELS: Record<string, string> = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' };
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UPI', 'OTHER'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

// Small reusable modal shell — no dialog component exists elsewhere in the
// app, so this stays local to the Expenses page. Used only for the Add
// Category / Add Sub Category popups opened from the expense form's
// Category and Sub Category dropdowns.
// Rendered into document.body via a portal, so the overlay always covers the
// whole viewport (including the top header) instead of being confined by
// the dashboard layout's containers.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">{title}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

// List filters — all applied server-side by GET /api/expenses (categoryId,
// subCategoryId, source alongside the existing status/expenseType/project/
// product params), so pagination counts stay correct.
interface ExpenseListFilters { categoryId: string; subCategoryId: string; source: string; dateFrom: string; dateTo: string }
const blankListFilters: ExpenseListFilters = { categoryId: '', subCategoryId: '', source: '', dateFrom: '', dateTo: '' };
const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SALARY', label: 'Salary (Payroll)' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement' },
  { value: 'BILL', label: 'Bill' },
];

// Shared by the list fetch and the Export button, so an export always
// covers exactly the records the list is filtered to.
function buildExpenseParams(status: string, expenseType: string, projectId: string, productId: string, filters: ExpenseListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (expenseType) params.set('expenseType', expenseType);
  if (projectId) params.set('projectId', projectId);
  if (productId) params.set('productId', productId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.subCategoryId) params.set('subCategoryId', filters.subCategoryId);
  if (filters.source) params.set('source', filters.source);
  // Expense Date range, both ends inclusive (YYYY-MM-DD).
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params;
}

async function fetchExpenses(status: string, expenseType: string, projectId: string, productId: string, page: number, size: number, filters: ExpenseListFilters): Promise<ExpenseListResponse> {
  const params = buildExpenseParams(status, expenseType, projectId, productId, filters);
  params.set('page', String(page));
  params.set('size', String(size));
  const res = await fetch(`/api/expenses?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}
async function fetchCategories(): Promise<ExpenseCategory[]> {
  const res = await fetch('/api/expenses/categories');
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}
async function fetchCurrencies(): Promise<CurrencyOption[]> {
  const res = await fetch('/api/currencies?activeOnly=true');
  if (!res.ok) throw new Error('Failed to fetch currencies');
  return res.json();
}
// Same fetch-leads-for-a-dropdown pattern as InvoiceListPage.tsx's
// fetchLeads — scoped to CONFIRMED leads (i.e. Customers), matching how
// src/app/dashboard/customers/page.tsx defines "Customer".
async function fetchCustomers(): Promise<CustomerOption[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc&status=CONFIRMED');
  if (!res.ok) throw new Error('Failed to fetch customers');
  const data = await res.json();
  return data.content;
}
async function fetchProjects(): Promise<ProjectOption[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}
async function fetchProducts(): Promise<ProductOption[]> {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

const blankForm = {
  categoryId: '', subCategoryId: '', vendorLeadId: '', expenseType: 'OVERALL' as 'OVERALL' | 'PROJECT' | 'PRODUCT', projectId: '', productId: '',
  expenseDate: dayjs().format('YYYY-MM-DD'), amount: '', currencyCode: 'INR',
  exchangeRate: '', paymentMethod: '', referenceNumber: '', notes: '', status: 'PENDING',
};

export default function ExpensesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canCreate = has('create_expenses');
  const canEdit = has('edit_expenses');
  const canDelete = has('delete_expenses');
  const [statusFilter, setStatusFilter] = useState('');
  // Top-level Overall Expenses / Project Expenses / Product Expenses tabs —
  // independent of the status filter below (payment status vs. whether the
  // expense has a Project or Product), same split as the create form's own
  // Expense Type toggle. Defaults to Overall, same "first tab is the
  // default" convention as the Leads/Implementations modules' own tabs.
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'OVERALL' | 'PROJECT' | 'PRODUCT'>('OVERALL');
  // Narrows the Project Expenses tab to one Project via the project tabs
  // rendered below the status tabs — '' means "All Projects" (still scoped
  // to expenseTypeFilter=PROJECT, so still no Overall Expenses mixed in).
  // Filters by the actual projectId FK (see fetchExpenses/API's own
  // projectId param), never by project name. Meaningless for the Overall
  // tab, so cleared whenever that tab is picked.
  const [projectFilter, setProjectFilter] = useState('');
  // Same, for the Product Expenses tab.
  const [productFilter, setProductFilter] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Which expense row has its details accordion (Employee / Reimbursement /
  // Bill / Payment Details) open — one at a time: opening a row closes the
  // previously open one.
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<number>>(new Set());
  const toggleDetails = (id: number) => setExpandedDetailIds((prev) => (prev.has(id) ? new Set() : new Set([id])));
  const [form, setForm] = useState(blankForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Clears one field's stale "required" message as soon as the user actually
  // changes it — the form's own submit handler only runs validation again on
  // the next submit, so without this a message set by a failed submit
  // attempt would otherwise keep showing even after the field now holds a
  // valid value. Same pattern used across every other module's form in this
  // app (see e.g. src/app/dashboard/demos/page.tsx's own clearFieldError).
  const clearFieldError = (key: string) => setFormErrors((fe) => (key in fe ? Object.fromEntries(Object.entries(fe).filter(([k]) => k !== key)) : fe));
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [showSubCategoryForm, setShowSubCategoryForm] = useState(false);
  const [subCategoryForm, setSubCategoryForm] = useState({ categoryId: '', name: '' });
  const [editingSubCategoryId, setEditingSubCategoryId] = useState<number | null>(null);
  // Project tabs search — narrows the vertical Project Expenses tab list by
  // name, client-side (the full project list is already loaded for the
  // tabs/create-form dropdown, same as the Expense Categories search above).
  // "All Projects" always stays visible regardless of the search term, since
  // it isn't a project name to match against.
  const [projectSearchInput, setProjectSearchInput] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setProjectSearch(projectSearchInput), 400);
    return () => clearTimeout(t);
  }, [projectSearchInput]);

  // Product tabs search — same convention as the Project tabs search above,
  // for the Product Expenses tab.
  const [productSearchInput, setProductSearchInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setProductSearch(productSearchInput), 400);
    return () => clearTimeout(t);
  }, [productSearchInput]);

  const [listFilters, setListFilters] = useState<ExpenseListFilters>(blankListFilters);
  // Any filter change goes back to page 1 of the (re-filtered) results.
  const updateListFilters = (patch: Partial<ExpenseListFilters>) => { setListFilters((f) => ({ ...f, ...patch })); setPage(0); };
  const [showFilters, setShowFilters] = useState(false);
  const activeListFilterCount = [listFilters.categoryId, listFilters.subCategoryId, listFilters.source, listFilters.dateFrom || listFilters.dateTo].filter(Boolean).length;
  const hasActiveFilters = !!(listFilters.categoryId || listFilters.subCategoryId || listFilters.source || listFilters.dateFrom || listFilters.dateTo || statusFilter);
  const { data, isLoading } = useQuery({ queryKey: ['expenses', statusFilter, expenseTypeFilter, projectFilter, productFilter, page, size, listFilters], queryFn: () => fetchExpenses(statusFilter, expenseTypeFilter === 'OVERALL' ? '' : expenseTypeFilter, projectFilter, productFilter, page, size, listFilters),
    // Statuses change from other modules (Reimbursement Approvals, Payroll,
    // Bills) — always refetch on return, even from another browser tab.
    refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
  // ^ The Overall Expenses tab lists every expense (Overall + Project +
  // Product, each Project/Product row badged in the table), so it sends no
  // expenseType filter. The API's own expenseType=OVERALL ("neither
  // project nor product") is unchanged for other callers like reports.
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: fetchCategories });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });
  const { data: customers = [] } = useQuery({ queryKey: ['customers-for-expense-vendor'], queryFn: fetchCustomers });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-for-expense'], queryFn: fetchProjects });
  const filteredProjects = projectSearch
    ? projects.filter((p) => p.projectName.toLowerCase().includes(projectSearch.trim().toLowerCase()))
    : projects;
  const { data: products = [] } = useQuery({ queryKey: ['products-for-expense'], queryFn: fetchProducts });
  const filteredProducts = productSearch
    ? products.filter((p) => p.productName.toLowerCase().includes(productSearch.trim().toLowerCase()))
    : products;

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm); setFormErrors({}); };
  const { ref: formRef, trigger: scrollToForm } = useScrollFormIntoView<HTMLFormElement>();

  const openEdit = (row: ExpenseRow) => {
    setEditingId(row.id);
    // Guards against a still-open form's stale validation messages from a
    // previous failed create attempt bleeding into this edit — closeForm
    // already clears this on the normal Cancel path, this is just defense
    // in depth.
    setFormErrors({});
    setForm({
      categoryId: String(row.categoryId),
      subCategoryId: row.subCategoryId ? String(row.subCategoryId) : '',
      vendorLeadId: row.vendorLeadId ? String(row.vendorLeadId) : '',
      expenseType: row.projectId ? 'PROJECT' : row.productId ? 'PRODUCT' : 'OVERALL',
      projectId: row.projectId ? String(row.projectId) : '',
      productId: row.productId ? String(row.productId) : '',
      expenseDate: dayjs(row.expenseDate).format('YYYY-MM-DD'),
      amount: row.amount,
      currencyCode: row.currencyCode,
      exchangeRate: row.currencyCode === 'INR' ? '' : row.exchangeRate,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber || '',
      notes: row.notes || '',
      status: row.status,
    });
    setShowForm(true);
    scrollToForm();
  };

  const save = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
      const method = editingId ? 'PUT' : 'POST';
      // expenseType is a client-only toggle (not a stored field) — when a
      // type isn't selected, its own FK is force-cleared here regardless of
      // whatever it was left at, so switching away from Project/Product
      // Expense can't leak a stale selection into the saved record.
      const { expenseType, ...rest } = form;
      const payload = {
        ...rest,
        projectId: expenseType === 'PROJECT' ? form.projectId : '',
        productId: expenseType === 'PRODUCT' ? form.productId : '',
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save expense'); }
      return res.json();
    },
    onSuccess: () => { invalidateExpenseData(queryClient); toast.success(editingId ? 'Expense updated' : 'Expense recorded'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  // The Mark Paid popup — same flow as Reimbursement Approvals' own: pick
  // the payment type, then save. null = closed.
  const [payingExpense, setPayingExpense] = useState<ExpenseRow | null>(null);
  const [payPaymentMethod, setPayPaymentMethod] = useState('');
  const [payProof, setPayProof] = useState<{ url: string; name: string } | null>(null);
  const [payProofUploading, setPayProofUploading] = useState(false);
  const openPayModal = (row: ExpenseRow) => { setPayingExpense(row); setPayPaymentMethod(row.paymentMethod || ''); setPayProof(null); };
  const closePayModal = () => { setPayingExpense(null); setPayPaymentMethod(''); setPayProof(null); };

  const markPaid = useMutation({
    mutationFn: async ({ id, paymentMethod, proof }: { id: number; paymentMethod: string; proof: { url: string; name: string } | null }) => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PAID', paymentMethod, ...(proof && { paymentProofUrl: proof.url, paymentProofName: proof.name }) }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to mark paid'); }
      return res.json();
    },
    onSuccess: () => { invalidateExpenseData(queryClient); toast.success('Marked as paid'); closePayModal(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const confirmPayment = () => {
    if (!payingExpense) return;
    if (!payPaymentMethod) { toast.error('Select a payment type'); return; }
    markPaid.mutate({ id: payingExpense.id, paymentMethod: payPaymentMethod, proof: payProof });
  };

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete expense'); }
      return res.json();
    },
    onSuccess: () => { invalidateExpenseData(queryClient); toast.success('Expense deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeCategoryForm = () => { setShowCategoryForm(false); setEditingCategoryId(null); setCategoryForm({ name: '', description: '' }); };
  const openAddCategory = () => { setEditingCategoryId(null); setCategoryForm({ name: '', description: '' }); setShowCategoryForm(true); };
  const openEditCategory = (c: ExpenseCategory) => { setEditingCategoryId(c.id); setCategoryForm({ name: c.name, description: c.description || '' }); setShowCategoryForm(true); };

  // Create (POST) or update (PUT) — same editingId-branches-the-request
  // pattern as every other module's save mutation in this app (see Leads,
  // Invoices, etc).
  const saveCategory = useMutation({
    mutationFn: async () => {
      const url = editingCategoryId ? `/api/expenses/categories/${editingCategoryId}` : '/api/expenses/categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save category'); }
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success(editingCategoryId ? 'Category updated' : 'Category created');
      // Newly created categories are auto-selected into the expense form,
      // since that's the only place this popup is opened from now.
      if (!editingCategoryId) {
        setForm((f) => ({ ...f, categoryId: String(created.id), subCategoryId: '' }));
        clearFieldError('categoryId');
      }
      closeCategoryForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete category'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); toast.success('Category deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeleteCategory = (c: ExpenseCategory) => {
    if (window.confirm(`Delete category "${c.name}"? This cannot be undone.`)) deleteCategory.mutate(c.id);
  };

  const closeSubCategoryForm = () => { setShowSubCategoryForm(false); setEditingSubCategoryId(null); setSubCategoryForm({ categoryId: '', name: '' }); };
  // Pre-fills the popup's category with whatever is picked in the expense form.
  const openAddSubCategory = () => { setEditingSubCategoryId(null); setSubCategoryForm({ categoryId: form.categoryId, name: '' }); setShowSubCategoryForm(true); };
  const openEditSubCategory = (s: ExpenseSubCategory) => { setEditingSubCategoryId(s.id); setSubCategoryForm({ categoryId: String(s.categoryId), name: s.name }); setShowSubCategoryForm(true); };

  const saveSubCategory = useMutation({
    mutationFn: async () => {
      const url = editingSubCategoryId ? `/api/expenses/sub-categories/${editingSubCategoryId}` : '/api/expenses/sub-categories';
      const method = editingSubCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subCategoryForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save sub-category'); }
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success(editingSubCategoryId ? 'Sub-category updated' : 'Sub-category created');
      // Newly created sub-categories are auto-selected into the expense form
      // (both fields, since a sub-category always belongs to exactly one
      // category, regardless of what was picked in the popup).
      if (!editingSubCategoryId) {
        setForm((f) => ({ ...f, categoryId: String(created.categoryId), subCategoryId: String(created.id) }));
        clearFieldError('categoryId');
        clearFieldError('subCategoryId');
      }
      closeSubCategoryForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSubCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/sub-categories/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete sub-category'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); toast.success('Sub-category deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeleteSubCategory = (s: ExpenseSubCategory) => {
    if (window.confirm(`Delete sub-category "${s.name}"? This cannot be undone.`)) deleteSubCategory.mutate(s.id);
  };

  // Flattened for the standalone Sub Categories table — each row keeps its
  // parent category's name for display, same underlying data as the
  // per-category list embedded in the Categories table.
  const allSubCategories = categories.flatMap((c) => c.subCategories.map((s) => ({ ...s, categoryName: c.name })));

  const selectedCategory = categories.find((c) => c.id === Number(form.categoryId));
  const subCategoryOptions = selectedCategory?.subCategories || [];

  const expenses = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const pageSubTotal = expenses.reduce((sum, e) => sum + (e.currencyCode === 'INR' ? Number(e.amount) : Number(e.amount) * Number(e.exchangeRate)), 0);
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Expenses</h1>
            <div className="overflow-x-auto">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {(['OVERALL', 'PROJECT', 'PRODUCT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { if (showForm) closeForm(); setExpenseTypeFilter(t); setProjectFilter(''); setProductFilter(''); setPage(0); if (t !== 'OVERALL' && listFilters.source === 'REIMBURSEMENT') updateListFilters({ source: '' }); }}
                    className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium whitespace-nowrap transition-colors ${expenseTypeFilter === t ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    {t === 'OVERALL' ? 'Overall Expenses' : t === 'PROJECT' ? 'Project Expenses' : 'Product Expenses'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <button
                // The form's Expense Type follows the active main tab; a project /
                // product already picked in the side list is pre-filled.
                onClick={() => {
                  if (showForm) { closeForm(); return; }
                  setForm({
                    ...blankForm,
                    expenseType: expenseTypeFilter,
                    projectId: expenseTypeFilter === 'PROJECT' ? projectFilter : '',
                    productId: expenseTypeFilter === 'PRODUCT' ? productFilter : '',
                  });
                  setShowForm(true);
                  scrollToForm();
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                <PlusIcon className="h-4 w-4" /> New Expense
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${showFilters || activeListFilterCount > 0 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <FunnelIcon className="h-4 w-4" /> Filters
              {activeListFilterCount > 0 && <span className="px-1.5 rounded-full bg-amber-600 text-white text-xs">{activeListFilterCount}</span>}
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            {/* CSV of every record matching the current tab + filters (not just this page). */}
            <a
              href={`/api/expenses/export?${buildExpenseParams(statusFilter, expenseTypeFilter === 'OVERALL' ? '' : expenseTypeFilter, projectFilter, productFilter, listFilters).toString()}`}
              download
              className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowDownTrayIcon className="h-4 w-4" /> Export
            </a>
          </div>
        </div>
        {/* Category / Sub Category / Source filters — Status is the tabs in the list below. */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-44">
              <AddableSelect
                value={listFilters.categoryId}
                // Keeps the picked Sub Category only if it belongs to the new Category.
                onChange={(v) => updateListFilters({
                  categoryId: v,
                  subCategoryId: v && allSubCategories.find((s) => String(s.id) === listFilters.subCategoryId)?.categoryId !== Number(v) ? '' : listFilters.subCategoryId,
                })}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="All Categories"
              />
            </div>
            <div className="w-full sm:w-44">
              <AddableSelect
                value={listFilters.subCategoryId}
                onChange={(v) => updateListFilters({ subCategoryId: v })}
                // No Category picked: every sub-category, tagged with its
                // category (the same name can exist under several).
                options={listFilters.categoryId
                  ? allSubCategories.filter((s) => s.categoryId === Number(listFilters.categoryId)).map((s) => ({ value: String(s.id), label: s.name }))
                  : allSubCategories.map((s) => ({ value: String(s.id), label: `${s.name} (${s.categoryName})` }))}
                placeholder="All Sub Categories"
              />
            </div>
            <div className="w-full sm:w-44">
              <AddableSelect
                value={listFilters.source}
                onChange={(v) => updateListFilters({ source: v })}
                options={expenseTypeFilter === 'OVERALL' ? SOURCE_OPTIONS : SOURCE_OPTIONS.filter((o) => o.value !== 'REIMBURSEMENT')}
                placeholder="All Sources"
              />
            </div>
            {/* Expense Date range — same From / To inputs as the Audit Log filters. */}
            <div className="flex items-center gap-2">
              <label htmlFor="expense-date-from" className="text-xs font-medium text-slate-600">From</label>
              <input
                id="expense-date-from"
                type="date"
                value={listFilters.dateFrom}
                max={listFilters.dateTo || undefined}
                onChange={(e) => updateListFilters({ dateFrom: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="expense-date-to" className="text-xs font-medium text-slate-600">To</label>
              <input
                id="expense-date-to"
                type="date"
                value={listFilters.dateTo}
                min={listFilters.dateFrom || undefined}
                onChange={(e) => updateListFilters({ dateTo: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (!form.categoryId) errs.categoryId = 'Category is required';
            if (subCategoryOptions.length > 0 && !form.subCategoryId) errs.subCategoryId = 'Sub-category is required';
            if (form.expenseType === 'PROJECT' && !form.projectId) errs.projectId = 'Project is required';
            if (form.expenseType === 'PRODUCT' && !form.productId) errs.productId = 'Product is required';
            if (!form.expenseDate) errs.expenseDate = 'Expense date is required';
            if (!form.amount) errs.amount = 'Amount is required';
            if (!form.paymentMethod) errs.paymentMethod = 'Payment method is required';
            setFormErrors(errs);
            if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
            save.mutate();
          }}
          ref={formRef}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 scroll-mt-4"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit' : 'Record'} {form.expenseType === 'PROJECT' ? 'Project Expense' : form.expenseType === 'PRODUCT' ? 'Product Expense' : 'Expense'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <AddableSelect
                value={form.categoryId}
                onChange={(v) => { setForm((f) => ({ ...f, categoryId: v, subCategoryId: '' })); clearFieldError('categoryId'); }}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Select category"
                onAdd={canCreate ? openAddCategory : undefined}
                addLabel="Add Category"
                error={!!formErrors.categoryId}
              />
              {formErrors.categoryId && <p className="text-xs text-red-600 mt-1">{formErrors.categoryId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sub Category{subCategoryOptions.length > 0 ? ' *' : ''}</label>
              <AddableSelect
                value={form.subCategoryId}
                onChange={(v) => { setForm((f) => ({ ...f, subCategoryId: v })); clearFieldError('subCategoryId'); }}
                options={subCategoryOptions.map((s) => ({ value: String(s.id), label: s.name }))}
                placeholder={!form.categoryId ? 'Select a category first' : subCategoryOptions.length === 0 ? 'No sub-categories' : 'Select sub-category'}
                onAdd={canCreate ? openAddSubCategory : undefined}
                addLabel="Add Sub Category"
                // Enabled as soon as a category is picked (not only when it
                // already has sub-categories), so the first one can be added.
                disabled={!form.categoryId}
                error={!!formErrors.subCategoryId}
              />
              {formErrors.subCategoryId && <p className="text-xs text-red-600 mt-1">{formErrors.subCategoryId}</p>}
            </div>
            {editingId && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                <AddableSelect
                  value={form.vendorLeadId}
                  onChange={(v) => setForm((f) => ({ ...f, vendorLeadId: v }))}
                  options={customers.map((c) => ({ value: String(c.id), label: c.companyName }))}
                  placeholder="Select customer"
                />
              </div>
            )}
            {form.expenseType === 'PROJECT' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project *</label>
                <AddableSelect
                  value={form.projectId}
                  onChange={(v) => { setForm((f) => ({ ...f, projectId: v })); clearFieldError('projectId'); }}
                  options={projects.map((p) => ({ value: String(p.id), label: p.projectName }))}
                  placeholder="Select project"
                  error={!!formErrors.projectId}
                />
                {formErrors.projectId && <p className="text-xs text-red-600 mt-1">{formErrors.projectId}</p>}
              </div>
            )}
            {form.expenseType === 'PRODUCT' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product *</label>
                <AddableSelect
                  value={form.productId}
                  onChange={(v) => { setForm((f) => ({ ...f, productId: v })); clearFieldError('productId'); }}
                  options={products.map((p) => ({ value: String(p.id), label: p.productName }))}
                  placeholder="Select product"
                  error={!!formErrors.productId}
                />
                {formErrors.productId && <p className="text-xs text-red-600 mt-1">{formErrors.productId}</p>}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expense Date *</label>
              <input
                type="date"
                value={form.expenseDate}
                onChange={(e) => { setForm((f) => ({ ...f, expenseDate: e.target.value })); clearFieldError('expenseDate'); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${formErrors.expenseDate ? 'border-red-400' : 'border-slate-300'}`}
              />
              {formErrors.expenseDate && <p className="text-xs text-red-600 mt-1">{formErrors.expenseDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); clearFieldError('amount'); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${formErrors.amount ? 'border-red-400' : 'border-slate-300'}`}
              />
              {formErrors.amount && <p className="text-xs text-red-600 mt-1">{formErrors.amount}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <AddableSelect
                value={form.currencyCode}
                onChange={(v) => setForm((f) => ({ ...f, currencyCode: v }))}
                options={[{ value: 'INR', label: 'INR' }, ...currencies.filter((c) => c.currencyCode !== 'INR').map((c) => ({ value: c.currencyCode, label: c.currencyCode }))]}
                placeholder="Select currency"
              />
            </div>
            {form.currencyCode !== 'INR' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exchange Rate (→ INR)</label>
                <input type="number" min="0" step="0.000001" value={form.exchangeRate} onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))} className={inputCls} placeholder="Leave blank to auto-resolve" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method *</label>
              <AddableSelect
                value={form.paymentMethod}
                onChange={(v) => { setForm((f) => ({ ...f, paymentMethod: v })); clearFieldError('paymentMethod'); }}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))}
                placeholder="Select method"
                error={!!formErrors.paymentMethod}
              />
              {formErrors.paymentMethod && <p className="text-xs text-red-600 mt-1">{formErrors.paymentMethod}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference / Bill No.</label>
              <input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <AddableSelect
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={[{ value: 'PENDING', label: 'Pending' }, { value: 'PAID', label: 'Paid' }]}
                placeholder="Select status"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
       <div className={expenseTypeFilter !== 'OVERALL' ? 'flex flex-col md:flex-row' : ''}>
        {/* Project tabs — one section/tab per Project, sourced dynamically
            from the same fetchProjects() list the create form's Project
            dropdown uses, laid out as a vertical list (there are typically
            too many projects for a single horizontal row to stay readable).
            Styled as the same segmented-pill control as VIEW_TABS on the
            Leads page and the Overall/Project Expenses toggle above (a
            bg-slate-100 track, rounded-md buttons, active = bg-white +
            text-amber-700 + shadow-sm, transition-colors only — no new
            animation style introduced). "All Projects" clears projectFilter;
            picking a project narrows to its projectId, same as the status
            tabs to the right narrow to a payment status. Only relevant to
            the Project Expenses tab, since Overall Expenses never carry a
            projectId. */}
        {expenseTypeFilter === 'PROJECT' && (
          <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 p-3 md:max-h-[600px] md:overflow-y-auto">
            <p className="px-2 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Projects</p>
            {/* Same search-with-clear-button styling as the Expense
                Categories search below, sized for the sidebar. Filters the
                tab list only — "All Projects" stays outside the search
                results since it isn't itself a project name. */}
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={projectSearchInput}
                onChange={(e) => setProjectSearchInput(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              {projectSearchInput && (
                <button onClick={() => { setProjectSearchInput(''); setProjectSearch(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => { setProjectFilter(''); setPage(0); }}
                className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium text-left whitespace-nowrap transition-colors ${projectFilter === '' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
              >
                All Projects
              </button>
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProjectFilter(String(p.id)); setPage(0); }}
                  className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium text-left whitespace-nowrap transition-colors ${projectFilter === String(p.id) ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                >
                  {p.projectName}
                </button>
              ))}
              {projectSearch && filteredProjects.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">No projects found</p>
              )}
            </div>
          </div>
        )}

        {/* Product tabs — same convention as the Project tabs above, for
            the Product Expenses tab (fetchProducts() → GET /api/products,
            same list the create form's Product dropdown uses). */}
        {expenseTypeFilter === 'PRODUCT' && (
          <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 p-3 md:max-h-[600px] md:overflow-y-auto">
            <p className="px-2 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Products</p>
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearchInput}
                onChange={(e) => setProductSearchInput(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              {productSearchInput && (
                <button onClick={() => { setProductSearchInput(''); setProductSearch(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => { setProductFilter(''); setPage(0); }}
                className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium text-left whitespace-nowrap transition-colors ${productFilter === '' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
              >
                All Products
              </button>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProductFilter(String(p.id)); setPage(0); }}
                  className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium text-left whitespace-nowrap transition-colors ${productFilter === String(p.id) ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                >
                  {p.productName}
                </button>
              ))}
              {productSearch && filteredProducts.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">No products found</p>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          {['', 'PENDING', 'PROCESSED', 'PARTIALLY_PAID', 'PAID'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {s ? s.replace('_', ' ') : 'All'}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : expenses.length === 0 ? (
          <p className="text-center py-16 text-slate-400">{hasActiveFilters ? 'No expenses match the selected filters' : 'No expenses recorded yet'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Expense</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Sub Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, idx) => (
                  <Fragment key={e.id}>
                  <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      {/* Paid manual expense with no Project/Product tag shown
                          (plain Overall, or the Project/Product tabs): the
                          Payment Details toggle sits beside the number. */}
                      {e.source === 'MANUAL' && e.status === 'PAID' && !(expenseTypeFilter === 'OVERALL' && (e.projectId || e.productId)) ? (
                        <button type="button" onClick={() => toggleDetails(e.id)} aria-expanded={expandedDetailIds.has(e.id)} aria-label="Toggle payment details" className="flex items-center gap-1 font-medium text-slate-800">
                          <ChevronDownIcon className={`h-3.5 w-3.5 text-green-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                          {e.expenseNumber}
                        </button>
                      ) : (
                        <p className="font-medium text-slate-800">{e.expenseNumber}</p>
                      )}
                      {/* Payroll/Reimbursement-generated rows have no vendor and
                          their reference (PAYROLL-YYYY-MM / REIMB-00000) is an
                          internal linking id, not something to show — this
                          line is display-only, e.vendor/referenceNumber are
                          untouched in the database either way. */}
                      {e.source !== 'SALARY' && e.source !== 'REIMBURSEMENT' && e.source !== 'BILL' && (e.vendor || e.referenceNumber) && (
                        <p className="text-xs text-slate-400">{[e.vendor, e.referenceNumber].filter(Boolean).join(' · ')}</p>
                      )}
                      {/* Same badge style as the Quotations list's "Calculator" tag. */}
                      {/* Reimbursement expenses show only their own badge, even
                          when the claim has a project/product. */}
                      {/* A paid manual expense's tag doubles as its Payment
                          Details toggle — chevron left of the tag, same as the
                          Reimbursement / Salary rows. */}
                      {expenseTypeFilter === 'OVERALL' && e.projectId && e.source !== 'REIMBURSEMENT' && (
                        e.source === 'MANUAL' && e.status === 'PAID' ? (
                          <button type="button" onClick={() => toggleDetails(e.id)} aria-expanded={expandedDetailIds.has(e.id)} aria-label="Toggle payment details" title={projects.find((p) => p.id === e.projectId)?.projectName} className="mt-1 flex items-center gap-1 w-fit">
                            <ChevronDownIcon className={`h-3.5 w-3.5 text-indigo-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700">Project</span>
                          </button>
                        ) : (
                          <span title={projects.find((p) => p.id === e.projectId)?.projectName} className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 w-fit">Project</span>
                        )
                      )}
                      {expenseTypeFilter === 'OVERALL' && e.productId && e.source !== 'REIMBURSEMENT' && (
                        e.source === 'MANUAL' && e.status === 'PAID' ? (
                          <button type="button" onClick={() => toggleDetails(e.id)} aria-expanded={expandedDetailIds.has(e.id)} aria-label="Toggle payment details" title={products.find((p) => p.id === e.productId)?.productName} className="mt-1 flex items-center gap-1 w-fit">
                            <ChevronDownIcon className={`h-3.5 w-3.5 text-teal-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-100 text-teal-700">Product</span>
                          </button>
                        ) : (
                          <span title={products.find((p) => p.id === e.productId)?.productName} className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-100 text-teal-700 w-fit">Product</span>
                        )
                      )}
                      {/* Reimbursement-generated: the accordion toggle chevron
                          sits to the left of the badge itself — clicking
                          either shows/hides the Reimbursement Details rows
                          below; no separate heading text. */}
                      {e.source === 'REIMBURSEMENT' && (
                        e.reimbursement ? (
                          <button
                            type="button"
                            onClick={() => toggleDetails(e.id)}
                            aria-expanded={expandedDetailIds.has(e.id)}
                            aria-label="Toggle reimbursement details"
                            className="mt-1 flex items-center gap-1 w-fit"
                          >
                            <ChevronDownIcon className={`h-3.5 w-3.5 text-orange-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-orange-100 text-orange-700">Reimbursement</span>
                          </button>
                        ) : (
                          <span className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-orange-100 text-orange-700 w-fit">Reimbursement</span>
                        )
                      )}
                      {/* Bill-generated: badge (supplier / invoice / bill no. are in the
                          Bill Details rows instead), with the
                          same chevron-left-of-badge toggle as Reimbursement —
                          expands to the Bill Details rows below. */}
                      {e.source === 'BILL' && (
                        e.bill ? (
                          <button
                            type="button"
                            onClick={() => toggleDetails(e.id)}
                            aria-expanded={expandedDetailIds.has(e.id)}
                            aria-label="Toggle bill details"
                            className="mt-1 flex items-center gap-1 w-fit"
                          >
                            <ChevronDownIcon className={`h-3.5 w-3.5 text-cyan-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                            <span title={`From ${e.bill.billNumber}`} className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-cyan-100 text-cyan-700">Bill</span>
                          </button>
                        ) : (
                          <span className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-cyan-100 text-cyan-700 w-fit">Bill</span>
                        )
                      )}
                      {e.source === 'BILL' && e.status === 'PARTIALLY_PAID' && e.bill && (
                        <p className="mt-1 text-xs text-slate-500">Paid {formatCurrency(e.bill.paidAmount, e.currencyCode)} of {formatCurrency(e.amount, e.currencyCode)}</p>
                      )}
                      {/* Payroll-generated: same chevron-left-of-badge toggle,
                          no separate heading text — expands to the Employee
                          Details rows below. */}
                      {e.source === 'SALARY' && (
                        e.payroll ? (
                          <button
                            type="button"
                            onClick={() => toggleDetails(e.id)}
                            aria-expanded={expandedDetailIds.has(e.id)}
                            aria-label="Toggle employee details"
                            className="mt-1 flex items-center gap-1 w-fit"
                          >
                            <ChevronDownIcon className={`h-3.5 w-3.5 text-violet-700 transition-transform ${expandedDetailIds.has(e.id) ? '' : '-rotate-90'}`} />
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700">Salary</span>
                          </button>
                        ) : (
                          <span className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700 w-fit">Salary</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.categoryName}</td>
                    <td className="px-4 py-3 text-slate-600">{e.subCategoryName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(e.expenseDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(e.amount, e.currencyCode)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status]}`}>{e.status.replace('_', ' ')}</span>
                      {/* Reimbursement's payment proof lives on its claim
                          (encrypted, served via the claim's file route). */}
                      {e.source === 'REIMBURSEMENT' && e.reimbursement?.paymentProofName && (
                        <a
                          href={`/api/payroll/expense-claims/${e.reimbursement.claimId}/file?type=payment-proof`}
                          target="_blank" rel="noopener noreferrer"
                          title={e.reimbursement.paymentProofName}
                          className="mt-1 flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 w-fit"
                        >
                          <PaperClipIcon className="h-3.5 w-3.5" /> Payment proof
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* SALARY / REIMBURSEMENT / BILL expenses follow their source's status — Edit only jumps to the source record, Delete stays disabled (this row can't be deleted independently of it). Plain inline icon buttons, same as the Manual row's own Edit/Delete below — no dropdown/popup. */}
                      {e.source === 'SALARY' || e.source === 'REIMBURSEMENT' || e.source === 'BILL' ? (
                        <div className="flex justify-end gap-2">
                          {/* Bills are managed on the Bills page. */}
                          {e.source === 'BILL' && e.bill && (
                            <button onClick={() => router.push('/dashboard/bills')} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          {e.source === 'SALARY' && e.payroll && (
                            <button onClick={() => router.push(`/dashboard/payroll/runs/${e.payroll!.runId}`)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          {e.source === 'REIMBURSEMENT' && e.reimbursement && (
                            <button onClick={() => router.push(`/dashboard/payroll/expense-claims?claimId=${e.reimbursement!.claimId}&status=${e.reimbursement!.claimStatus}`)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button disabled className="p-1.5 rounded text-slate-300 cursor-not-allowed" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                      <div className="flex justify-end gap-2">
                        {canEdit && e.status === 'PENDING' && (
                          <button onClick={() => openPayModal(e)} className="text-xs font-medium text-green-700 hover:text-green-800">Mark Paid</button>
                        )}
                        {canEdit && (
                          <button onClick={() => openEdit(e)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => { if (window.confirm(`Delete expense ${e.expenseNumber}?`)) remove.mutate(e.id); }}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                  {/* Payment Details accordion — what was saved in the Mark Paid popup. */}
                  {e.source === 'MANUAL' && e.status === 'PAID' && expandedDetailIds.has(e.id) && (
                    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td colSpan={7} className="px-4 pb-4 pt-0">
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Payment Type</th>
                                <th className="px-3 py-2 text-left font-semibold">Paid Date</th>
                                <th className="px-3 py-2 text-left font-semibold">Attachment</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2 text-slate-700">{e.paymentMethod ? e.paymentMethod.replace('_', ' ') : '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{e.paidDate ? dayjs(e.paidDate).format('DD MMM YYYY') : '—'}</td>
                                <td className="px-3 py-2">
                                  {e.paymentProofUrl ? (
                                    <a href={e.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800">
                                      <PaperClipIcon className="h-3.5 w-3.5" /> {e.paymentProofName || 'View attachment'}
                                    </a>
                                  ) : <span className="text-slate-400">None attached</span>}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Bill Details accordion — the source bill. */}
                  {e.bill && expandedDetailIds.has(e.id) && (
                    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td colSpan={7} className="px-4 pb-4 pt-0">
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Bill</th>
                                <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                                <th className="px-3 py-2 text-left font-semibold">Bill Type</th>
                                <th className="px-3 py-2 text-left font-semibold">Invoice</th>
                                <th className="px-3 py-2 text-left font-semibold">Invoice Date</th>
                                <th className="px-3 py-2 text-right font-semibold">Item Total</th>
                                <th className="px-3 py-2 text-right font-semibold">GST</th>
                                <th className="px-3 py-2 text-right font-semibold">TDS</th>
                                <th className="px-3 py-2 text-right font-semibold">Payable</th>
                                <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                                <th className="px-3 py-2 text-left font-semibold">Payment</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2 text-slate-600">{e.bill.billNumber}</td>
                                <td className="px-3 py-2 font-medium text-slate-800">{e.bill.supplierName}</td>
                                <td className="px-3 py-2 text-slate-600">{BILL_TYPE_LABELS[e.bill.billType] || e.bill.billType}</td>
                                <td className="px-3 py-2 text-slate-600">{e.bill.invoiceNumber}</td>
                                <td className="px-3 py-2 text-slate-600">{dayjs(e.bill.invoiceDate).format('DD MMM YYYY')}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(e.bill.itemTotal, 'INR')}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(e.bill.gstTotal, 'INR')}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(e.bill.tdsTotal, 'INR')}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">{formatCurrency(e.bill.payableAmount, 'INR')}</td>
                                <td className={`px-3 py-2 text-right font-medium ${billRemaining(e.bill) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{formatCurrency(billRemaining(e.bill), 'INR')}</td>
                                <td className="px-3 py-2 text-slate-600">
                                  {BILL_PAYMENT_LABELS[e.bill.paymentStatus] || e.bill.paymentStatus}
                                  {e.bill.paymentStatus === 'PARTIALLY_PAID' && <span className="text-slate-400"> · {formatCurrency(e.bill.paidAmount, 'INR')} paid</span>}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Reimbursement Details accordion — the source claim. */}
                  {e.reimbursement && expandedDetailIds.has(e.id) && (
                    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td colSpan={7} className="px-4 pb-4 pt-0">
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Employee</th>
                                <th className="px-3 py-2 text-left font-semibold">Claim Date</th>
                                <th className="px-3 py-2 text-left font-semibold">Approved</th>
                                <th className="px-3 py-2 text-left font-semibold">Customer</th>
                                <th className="px-3 py-2 text-left font-semibold">Project</th>
                                <th className="px-3 py-2 text-left font-semibold">Product</th>
                                <th className="px-3 py-2 text-left font-semibold">Description</th>
                                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2">
                                  <p className="font-medium text-slate-800">{e.reimbursement.employeeName}</p>
                                  <p className="text-slate-400">{e.reimbursement.employeeCode}</p>
                                </td>
                                <td className="px-3 py-2 text-slate-600">{dayjs(e.reimbursement.claimDate).format('DD MMM YYYY')}</td>
                                <td className="px-3 py-2 text-slate-600">{e.reimbursement.approvedAt ? dayjs(e.reimbursement.approvedAt).format('DD MMM YYYY') : '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{e.reimbursement.customerName || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{e.reimbursement.projectName || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{e.reimbursement.productName || '—'}</td>
                                <td className="px-3 py-2 text-slate-600 whitespace-pre-wrap">{e.reimbursement.description}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">{formatCurrency(e.reimbursement.amount, 'INR')}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Employee Details accordion — the payroll run's payslips. */}
                  {e.payroll && expandedDetailIds.has(e.id) && (
                    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td colSpan={7} className="px-4 pb-4 pt-0">
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Employee</th>
                                <th className="px-3 py-2 text-left font-semibold">Employee ID</th>
                                <th className="px-3 py-2 text-left font-semibold">Payroll Month</th>
                                <th className="px-3 py-2 text-right font-semibold">Payable Days</th>
                                <th className="px-3 py-2 text-right font-semibold">LOP Days</th>
                                <th className="px-3 py-2 text-right font-semibold">Gross</th>
                                <th className="px-3 py-2 text-right font-semibold">Deductions</th>
                                <th className="px-3 py-2 text-right font-semibold">Net Salary</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.payroll.employees.map((emp) => (
                                <tr key={emp.payslipId} className="border-t border-slate-100">
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-slate-800">{emp.employeeName}</p>
                                    {(emp.designation || emp.department) && <p className="text-slate-400">{[emp.designation, emp.department].filter(Boolean).join(' · ')}</p>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{emp.employeeCode}</td>
                                  <td className="px-3 py-2 text-slate-600">{dayjs(new Date(e.payroll!.payPeriodYear, e.payroll!.payPeriodMonth - 1, 1)).format('MMM YYYY')}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{Number(emp.payableDays)} / {emp.totalDays}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{Number(emp.lopDays)}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(emp.grossEarnings, 'INR')}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(emp.totalDeductions, 'INR')}</td>
                                  <td className="px-3 py-2 text-right font-medium text-slate-800">{formatCurrency(emp.netPay, 'INR')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
              {/* Sub Total = this page's rows; Total = every record matching the
                  current tab + filters. One page holds everything → Total only.
                  In INR (non-INR rows converted at their own exchange rate). */}
              <tfoot className="border-t border-slate-200">
                {totalPages > 1 && (
                  <tr className="bg-white">
                    <td colSpan={4} className="px-4 pt-3 pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Sub Total</td>
                    <td className="px-4 pt-3 pb-2 text-right text-sm font-medium tabular-nums whitespace-nowrap text-slate-700">{formatCurrency(pageSubTotal, 'INR')}</td>
                    <td colSpan={2} />
                  </tr>
                )}
                <tr className="bg-amber-50/70 border-t border-amber-200">
                  <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right text-base font-bold tabular-nums whitespace-nowrap text-amber-700">{formatCurrency(data?.totalAmount ?? 0, 'INR')}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {expenses.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <div className="w-28">
                <AddableSelect
                  value={String(size)}
                  onChange={(v) => { setSize(Number(v)); setPage(0); }}
                  clearable={false}
                  options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
                  placeholder="Rows"
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
        )}
        </div>
       </div>
      </div>

      {/* Add Category / Add Sub Category popups — opened from the
          "+ Add Category" / "+ Add Sub Category" options in the expense
          form's Category and Sub Category dropdowns. */}
      {showCategoryForm && (
        <Modal title={editingCategoryId ? 'Edit Category' : 'Add Category'} onClose={closeCategoryForm}>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!categoryForm.name) { toast.error('Name is required'); return; } saveCategory.mutate(); }}
            className="grid grid-cols-2 gap-3"
          >
            <input placeholder="Name" value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="Description (optional)" value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={closeCategoryForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveCategory.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveCategory.isPending ? 'Saving...' : editingCategoryId ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showSubCategoryForm && (
        <Modal title={editingSubCategoryId ? 'Edit Sub Category' : 'Add Sub Category'} onClose={closeSubCategoryForm}>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!subCategoryForm.categoryId) { toast.error('Select a category first'); return; } if (!subCategoryForm.name.trim()) { toast.error('Sub-category name is required'); return; } saveSubCategory.mutate(); }}
            className="grid grid-cols-2 gap-3"
          >
            {/* No category picker here — the category is the one already
                selected in the expense form (see openAddSubCategory). */}
            <input placeholder="Sub-category name" value={subCategoryForm.name} onChange={(e) => setSubCategoryForm((f) => ({ ...f, name: e.target.value }))} className={`${inputCls} col-span-2`} autoFocus />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={closeSubCategoryForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveSubCategory.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveSubCategory.isPending ? 'Saving...' : editingSubCategoryId ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {payingExpense && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={closePayModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Mark Expense as Paid</h3>
                <p className="text-xs text-slate-400 mt-0.5">{payingExpense.expenseNumber} · {formatCurrency(payingExpense.amount, payingExpense.currencyCode || 'INR')}</p>
              </div>
              <button onClick={closePayModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type</label>
                <AddableSelect value={payPaymentMethod} onChange={setPayPaymentMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))} placeholder="Select Payment Type" inline />
              </div>
              <AttachmentUploadField label="Supporting Document / Receipt" uploadUrl="/api/expenses/upload" value={payProof} onChange={setPayProof} onUploadingChange={setPayProofUploading} />
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button type="button" onClick={closePayModal} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={markPaid.isPending || payProofUploading} onClick={confirmPayment} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {markPaid.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
