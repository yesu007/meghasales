'use client';

import { useQuery } from '@tanstack/react-query';
import LegalDocumentsPanel from '@/components/payroll/LegalDocumentsPanel';

interface MyDocumentsResponse {
  employee: { employeeCode: string } | null;
}

async function fetchMyDocuments(): Promise<MyDocumentsResponse> {
  const res = await fetch('/api/payroll/my-documents');
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

// Self-service — no delete action here at all (canDelete=false): an
// employee can upload their own legal documents but can never delete one
// once uploaded, in this UI or against the backend (there's no delete
// route under /api/payroll/my-documents to call in the first place). The
// same uploaded document also shows up read/write from Employee Details >
// Legal Documents (and, since that's the same page, Payroll Employee too)
// — both surfaces read the one EmployeeLegalDocument table.
export default function MyDocumentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-documents-employee'], queryFn: fetchMyDocuments });

  if (isLoading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;

  if (!data?.employee) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Documents</h1>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16 text-slate-400">No payroll profile yet — you&apos;ll be able to upload documents here once you&apos;re onboarded.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Documents</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">{data.employee.employeeCode}</p>
      </div>
      <LegalDocumentsPanel apiBase="/api/payroll/my-documents" queryKey="my-documents" canUpload canDelete={false} responseHasWrapper />
    </div>
  );
}
