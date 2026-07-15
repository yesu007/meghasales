import { DocumentChartBarIcon } from '@heroicons/react/24/outline';

export default function AccountingReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-slate-500 mt-1">Outstanding, aging, collection, and overdue reports</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
        <DocumentChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Reports coming soon</p>
        <p className="text-sm text-slate-400 mt-1">Being built next</p>
      </div>
    </div>
  );
}
