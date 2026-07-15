'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// Reused as-is everywhere else in the app for status badges (blue=Pending,
// amber=Partially Paid, red=Overdue). PAID and CANCELLED are shifted from
// the badge colors (green-600 -> emerald-600, slate -> indigo-400)
// specifically for this chart: validated with the dataviz skill's palette
// checker, since 5 statuses sit adjacent in one pie and red/green-600 and
// slate-400 both failed CVD/chroma checks in that context.
const STATUS_CHART_COLORS: Record<string, string> = {
  PENDING: '#2563EB',
  PARTIALLY_PAID: '#D97706',
  PAID: '#059669',
  OVERDUE: '#DC2626',
  CANCELLED: '#818CF8',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

const BRAND = '#D97706'; // amber-600, matches the app's single accent color

function fmt(amount: number): string {
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

async function fetchDashboardStats() {
  const res = await fetch('/api/accounting/dashboard-stats');
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      <div style={{ width: '100%', height: 260 }}>{children}</div>
    </div>
  );
}

export default function AccountingDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['accounting-dashboard-stats'], queryFn: fetchDashboardStats });

  const kpis = data?.kpis;
  const charts = data?.charts;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-72 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const statusChartData = (charts?.statusDistribution || []).map((s: any) => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_CHART_COLORS[s.status] || '#94A3B8',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Accounting Dashboard</h1>
        <p className="text-slate-500 mt-1">KPIs and charts for invoices, payments, and collections</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Invoices" value={String(kpis?.totalInvoices ?? 0)} color="text-slate-800" />
        <KpiCard label="Total Invoice Value" value={fmt(kpis?.totalInvoiceValue ?? 0)} color="text-slate-800" />
        <KpiCard label="Amount Received" value={fmt(kpis?.amountReceived ?? 0)} color="text-emerald-600" />
        <KpiCard label="Outstanding Amount" value={fmt(kpis?.outstandingAmount ?? 0)} color="text-blue-600" />
        <KpiCard label="Overdue Amount" value={fmt(kpis?.overdueAmount ?? 0)} color="text-red-600" />
        <KpiCard label="Due Today" value={fmt(kpis?.dueToday ?? 0)} color="text-amber-600" />
        <KpiCard label="Due This Week" value={fmt(kpis?.dueThisWeek ?? 0)} color="text-amber-600" />
        <KpiCard label="Collection %" value={`${(kpis?.collectionPercentage ?? 0).toFixed(1)}%`} color="text-slate-800" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Monthly Collections">
          <ResponsiveContainer>
            <BarChart data={charts?.monthlyCollections || []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
              <Bar dataKey="amount" fill={BRAND} radius={[4, 4, 0, 0]} name="Collected" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding by Customer">
          <ResponsiveContainer>
            <BarChart data={charts?.outstandingByCustomer || []} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
              <YAxis type="category" dataKey="customer" width={110} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
              <Bar dataKey="outstanding" fill={BRAND} radius={[0, 4, 4, 0]} name="Outstanding" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Invoice Status Distribution">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {statusChartData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, color: '#475569' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Payment Trend (30 days)">
          <ResponsiveContainer>
            <LineChart data={charts?.paymentTrend || []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
              <Line type="monotone" dataKey="amount" stroke={BRAND} strokeWidth={2} dot={false} name="Collected" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
