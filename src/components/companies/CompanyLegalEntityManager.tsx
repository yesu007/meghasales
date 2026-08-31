'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon, DocumentIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import CountrySelect, { type Country } from '@/components/CountrySelect';

interface DocumentRow {
  id: number;
  fileName: string;
  description: string | null;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
  versions: { fileUrl: string; fileSize: number }[];
}
interface LegalEntity {
  id: number;
  legalName: string;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  currencyCode: string | null;
  isActive: boolean;
  country: { id: number; countryName: string; isoCode: string; flagEmoji: string | null };
  _count: { documents: number; leads: number; quotations: number };
}
interface CompanyDetail {
  id: number;
  name: string;
  legalEntities: LegalEntity[];
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchCompany(id: number): Promise<CompanyDetail> {
  const res = await fetch(`/api/companies/${id}`);
  if (!res.ok) throw new Error('Failed to fetch company');
  return res.json();
}
async function fetchDocuments(companyId: number, entityId: number): Promise<DocumentRow[]> {
  const res = await fetch(`/api/companies/${companyId}/legal-entities/${entityId}/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

const blankEntityForm = {
  countryId: null as number | null,
  legalName: '',
  registrationNumber: '',
  taxRegistrationNumber: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  currencyCode: '',
};

function EntityDocuments({ companyId, entity }: { companyId: number; entity: LegalEntity }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['legal-entity-documents', entity.id],
    queryFn: () => fetchDocuments(companyId, entity.id),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      if (description) formData.append('description', description);
      const res = await fetch(`/api/companies/${companyId}/legal-entities/${entity.id}/documents`, { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Upload failed'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-entity-documents', entity.id] });
      queryClient.invalidateQueries({ queryKey: ['company-for-tab', companyId] });
      toast.success('Document uploaded');
      setDescription('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await fetch(`/api/companies/${companyId}/legal-entities/${entity.id}/documents/${documentId}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to delete document'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['legal-entity-documents', entity.id] }); toast.success('Document deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Documents</p>
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-slate-400 mb-2">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <a href={d.versions[0]?.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-amber-700 hover:text-amber-800">
                <DocumentIcon className="h-4 w-4" /> {d.fileName}
              </a>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{dayjs(d.createdAt).format('DD MMM YYYY')}</span>
                <button onClick={() => remove.mutate(d.id)} className="p-1 rounded hover:text-red-600 hover:bg-red-50"><TrashIcon className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs" />
        <label className="px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 cursor-pointer whitespace-nowrap">
          {upload.isPending ? 'Uploading...' : 'Upload File'}
          <input type="file" className="hidden" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}

// Manages a Company's per-country legal entities (address, tax registration
// number, documents) — the Customer Company Master. Reusable so it can be
// embedded directly on a Customer/Lead's detail page rather than living
// behind its own separate "Companies" section (there is no standalone
// Companies list/detail page — this is the only place it's rendered).
export default function CompanyLegalEntityManager({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const { data: company, isLoading } = useQuery({ queryKey: ['company-for-tab', companyId], queryFn: () => fetchCompany(companyId) });

  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<number | null>(null);
  const [entityForm, setEntityForm] = useState(blankEntityForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const closeEntityForm = () => { setShowEntityForm(false); setEditingEntityId(null); setEntityForm(blankEntityForm); };
  const openEditEntity = (e: LegalEntity) => {
    setEditingEntityId(e.id);
    setEntityForm({
      countryId: e.country.id,
      legalName: e.legalName,
      registrationNumber: e.registrationNumber || '',
      taxRegistrationNumber: e.taxRegistrationNumber || '',
      addressLine1: e.addressLine1 || '',
      addressLine2: e.addressLine2 || '',
      city: e.city || '',
      state: e.state || '',
      postalCode: e.postalCode || '',
      currencyCode: e.currencyCode || '',
    });
    setShowEntityForm(true);
  };
  const selectEntityCountry = (c: Country) => setEntityForm((f) => ({ ...f, countryId: c.id, currencyCode: f.currencyCode || c.currencyCode }));

  const saveEntity = useMutation({
    mutationFn: async () => {
      const url = editingEntityId ? `/api/companies/${companyId}/legal-entities/${editingEntityId}` : `/api/companies/${companyId}/legal-entities`;
      const method = editingEntityId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entityForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save legal entity'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['company-for-tab', companyId] }); toast.success(editingEntityId ? 'Legal entity updated' : 'Legal entity added'); closeEntityForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateEntity = useMutation({
    mutationFn: async (entity: LegalEntity) => {
      if (entity._count.leads + entity._count.quotations > 0) {
        const res = await fetch(`/api/companies/${companyId}/legal-entities/${entity.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to deactivate legal entity'); }
        return res.json();
      }
      const res = await fetch(`/api/companies/${companyId}/legal-entities/${entity.id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete legal entity'); }
      return null;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['company-for-tab', companyId] }); toast.success('Legal entity removed'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !company) {
    return <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Legal Entities</h3>
        <button
          onClick={() => (showEntityForm ? closeEntityForm() : setShowEntityForm(true))}
          className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
        >
          <PlusIcon className="h-4 w-4" /> Add Legal Entity
        </button>
      </div>

      {showEntityForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!entityForm.countryId) { toast.error('Country is required'); return; }
            if (!entityForm.legalName.trim()) { toast.error('Registered legal name is required'); return; }
            saveEntity.mutate();
          }}
          className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3 mb-4"
        >
          <h4 className="text-sm font-semibold text-slate-700">{editingEntityId ? 'Edit Legal Entity' : 'New Legal Entity'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
              <CountrySelect value={entityForm.countryId} onChange={selectEntityCountry} disabled={!!editingEntityId} />
              {editingEntityId && <p className="text-xs text-slate-400 mt-1">Country is fixed once created — delete and re-add under the right country if this needs to change.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Registered Legal Name</label>
              <input value={entityForm.legalName} onChange={(e) => setEntityForm((f) => ({ ...f, legalName: e.target.value }))} className={inputCls} placeholder="e.g. Tekfilo Innovations Pvt. Ltd." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Registration / Incorporation Number</label>
              <input value={entityForm.registrationNumber} onChange={(e) => setEntityForm((f) => ({ ...f, registrationNumber: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tax Registration Number</label>
              <input value={entityForm.taxRegistrationNumber} onChange={(e) => setEntityForm((f) => ({ ...f, taxRegistrationNumber: e.target.value }))} className={inputCls} placeholder="GST / VAT / Tax ID" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1</label>
              <input value={entityForm.addressLine1} onChange={(e) => setEntityForm((f) => ({ ...f, addressLine1: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
              <input value={entityForm.addressLine2} onChange={(e) => setEntityForm((f) => ({ ...f, addressLine2: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
              <input value={entityForm.city} onChange={(e) => setEntityForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">State / Province</label>
              <input value={entityForm.state} onChange={(e) => setEntityForm((f) => ({ ...f, state: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Postal Code</label>
              <input value={entityForm.postalCode} onChange={(e) => setEntityForm((f) => ({ ...f, postalCode: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Billing Currency</label>
              <input value={entityForm.currencyCode} onChange={(e) => setEntityForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))} className={inputCls} placeholder="Defaults to country's currency" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeEntityForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={saveEntity.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {saveEntity.isPending ? 'Saving...' : editingEntityId ? 'Save Changes' : 'Add Entity'}
            </button>
          </div>
        </form>
      )}

      {company.legalEntities.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No legal entities yet — add one per country this company is registered in.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {company.legalEntities.map((e) => (
            <div key={e.id} className="py-3">
              <button onClick={() => setExpandedId((id) => (id === e.id ? null : e.id))} className="w-full flex items-center justify-between text-left">
                <div>
                  <p className="font-medium text-slate-800">{e.country.flagEmoji ? `${e.country.flagEmoji} ` : ''}{e.country.countryName} — {e.legalName}</p>
                  <p className="text-xs text-slate-400">
                    {e.taxRegistrationNumber ? `Tax Reg: ${e.taxRegistrationNumber}` : 'No tax registration number on file'}
                    {' · '}{e._count.documents} document{e._count.documents === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!e.isActive && <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">Inactive</span>}
                  {expandedId === e.id ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                </div>
              </button>
              {expandedId === e.id && (
                <div className="mt-3 pl-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                    <div><p className="text-xs text-slate-400">Registration No.</p><p className="text-slate-700">{e.registrationNumber || '—'}</p></div>
                    <div><p className="text-xs text-slate-400">Currency</p><p className="text-slate-700">{e.currencyCode || '—'}</p></div>
                    <div className="col-span-2 sm:col-span-3"><p className="text-xs text-slate-400">Address</p><p className="text-slate-700">{[e.addressLine1, e.addressLine2, e.city, e.state, e.postalCode].filter(Boolean).join(', ') || '—'}</p></div>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => openEditEntity(e)} className="text-xs font-medium text-amber-700 hover:text-amber-800">Edit</button>
                    <button
                      onClick={() => { if (window.confirm(`Remove legal entity "${e.legalName}"?`)) deactivateEntity.mutate(e); }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <EntityDocuments companyId={companyId} entity={e} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
