import { BookOpenIcon } from '@heroicons/react/24/outline';

export default function CustomerLedgerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Customer Ledger</h1>
        <p className="text-slate-500 mt-1">Running balance of invoices, payments, and credit notes per customer</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
        <BookOpenIcon className="h-12 w-12 mx-auto text-slate-300" />
        <p className="mt-4 text-lg font-medium text-slate-600">Customer ledger coming soon</p>
        <p className="text-sm text-slate-400 mt-1">Being built next</p>
      </div>
    </div>
  );
}
