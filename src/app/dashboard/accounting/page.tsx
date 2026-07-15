import { ChartBarIcon } from '@heroicons/react/24/outline';

export default function AccountingDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Accounting Dashboard</h1>
        <p className="text-slate-500 mt-1">KPIs and charts for invoices, payments, and collections</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
        <ChartBarIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Dashboard coming soon</p>
        <p className="text-sm text-slate-400 mt-1">KPI cards and charts are being built next</p>
      </div>
    </div>
  );
}
