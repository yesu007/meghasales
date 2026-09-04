'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/currency';

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

// Flag + accent color per currency. Colors come from the dataviz skill's
// validated categorical order (slots 1-7: blue, orange, aqua, yellow,
// magenta, green, violet) — assigned to a FIXED currency, not a rank
// position, so a given currency always renders the same color regardless
// of which other currencies are present in a given list.
const CURRENCY_META: Record<string, { flag: string; color: string }> = {
  INR: { flag: '🇮🇳', color: '#2a78d6' },
  USD: { flag: '🇺🇸', color: '#eb6834' },
  THB: { flag: '🇹🇭', color: '#1baf7a' },
  AED: { flag: '🇦🇪', color: '#eda100' },
  GBP: { flag: '🇬🇧', color: '#e87ba4' },
  SGD: { flag: '🇸🇬', color: '#008300' },
  SAR: { flag: '🇸🇦', color: '#4a3aa7' },
};
const FALLBACK_CURRENCY_META = { flag: '💱', color: '#e34948' };
const currencyMeta = (code: string) => CURRENCY_META[code] || FALLBACK_CURRENCY_META;

// India-specific lakh abbreviation is kept for INR only; every other
// currency uses standard grouped formatting via formatCurrency (no generic
// K/M abbreviator was requested).
function fmt(amount: number, currencyCode: string = 'INR'): string {
  if (currencyCode === 'INR' && Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return formatCurrency(amount, currencyCode);
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

async function fetchDashboardStats() {
  const res = await fetch('/api/accounting/dashboard-stats');
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      <div style={{ width: '100%', height: 260 }}>{children}</div>
    </div>
  );
}

function CurrencyCard({ kpis }: { kpis: any }) {
  const meta = currencyMeta(kpis.currencyCode);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-start gap-3">
      <span className="text-2xl leading-none">{meta.flag}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{kpis.currencyCode}</p>
        <p className="text-xl font-bold text-slate-800 mt-1 truncate">{fmt(kpis.outstandingAmount ?? 0, kpis.currencyCode)}</p>
        <p className="text-xs text-slate-500 mt-1">
          {kpis.totalInvoices ?? 0} invoices &bull; {(kpis.collectionPercentage ?? 0).toFixed(0)}% collected
        </p>
      </div>
    </div>
  );
}

function CustomerRow({ name, amount, currencyCode, maxValue }: { name: string; amount: number; currencyCode: string; maxValue: number }) {
  const meta = currencyMeta(currencyCode);
  const pct = maxValue > 0 ? Math.max(6, (amount / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
        style={{ backgroundColor: meta.color }}
      >
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700 truncate">{name}</p>
        <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 shrink-0 whitespace-nowrap">{fmt(amount, currencyCode)}</p>
    </div>
  );
}

function ListCard({
  title,
  icon,
  iconColor,
  rows,
  valueKey,
  emptyLabel,
}: {
  title: string;
  icon: string;
  iconColor: string;
  rows: { customer: string; currencyCode: string; [k: string]: any }[];
  valueKey: string;
  emptyLabel: string;
}) {
  // Bar length is scoped to rows sharing the same currency — never compared
  // across currencies, since a raw-amount comparison there (e.g. a ₹100,000
  // bar dwarfing a $2,000 one) would imply a magnitude relationship that
  // isn't real without a conversion rate.
  const maxValueByCurrency: Record<string, number> = {};
  for (const r of rows) {
    const v = r[valueKey] ?? 0;
    if (v > (maxValueByCurrency[r.currencyCode] ?? 0)) maxValueByCurrency[r.currencyCode] = v;
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-base ${iconColor}`}>{icon}</span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <CustomerRow key={i} name={r.customer} amount={r[valueKey] ?? 0} currencyCode={r.currencyCode} maxValue={maxValueByCurrency[r.currencyCode] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountingDashboardPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['accounting-dashboard-stats'], queryFn: fetchDashboardStats });
  const [cashFlowCurrency, setCashFlowCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (isError) toast.error('Failed to load dashboard stats');
  }, [isError]);

  const kpisByCurrency: any[] = data?.kpisByCurrency || [];
  const primaryCurrencyCode: string = data?.primaryCurrencyCode || 'INR';
  const charts = data?.charts;
  const monthlyCollectionsByCurrency: { currencyCode: string; data: any[] }[] = charts?.monthlyCollectionsByCurrency || [];
  const paymentTrendByCurrency: { currencyCode: string; data: any[] }[] = charts?.paymentTrendByCurrency || [];
  const moneyInByCustomer: any[] = charts?.moneyInByCustomer || [];
  const outstandingByCustomer: any[] = charts?.outstandingByCustomer || [];

  useEffect(() => {
    if (!cashFlowCurrency && paymentTrendByCurrency.length > 0) setCashFlowCurrency(paymentTrendByCurrency[0].currencyCode);
  }, [paymentTrendByCurrency, cashFlowCurrency]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-72 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  // Hero headline picks the currency with the largest OUTSTANDING balance,
  // not the largest total invoice value — a currency that happens to be
  // fully collected must never mask real outstanding amounts sitting in
  // other currencies (e.g. an all-time-largest INR book that's since been
  // paid off shouldn't show "₹0 outstanding" while USD/THB invoices are
  // still open).
  const heroKpi = [...kpisByCurrency].sort((a, b) => (b.outstandingAmount ?? 0) - (a.outstandingAmount ?? 0))[0] || kpisByCurrency[0];
  const activeCashFlow = paymentTrendByCurrency.find((s) => s.currencyCode === cashFlowCurrency) || paymentTrendByCurrency[0];

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

      {/* Hero — largest OUTSTANDING balance, not the largest invoice book.
          Never a blended sum across currencies; the Account cards below
          break out every currency present individually. */}
      <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Total Outstanding {kpisByCurrency.length > 1 && `(${heroKpi?.currencyCode})`}
          </p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-3xl font-bold text-white">{fmt(heroKpi?.outstandingAmount ?? 0, heroKpi?.currencyCode)}</p>
            <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-full">
              {(heroKpi?.collectionPercentage ?? 0).toFixed(0)}% collected
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/accounting/invoices" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 transition-colors">
            Pending Invoices
          </Link>
          <Link href="/dashboard/accounting/payment-reminders" className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 transition-colors">
            Reminders
          </Link>
          <Link href="/dashboard/accounting/reports" className="text-sm font-medium text-slate-900 bg-white hover:bg-slate-100 rounded-lg px-4 py-2 transition-colors">
            Reports
          </Link>
        </div>
      </div>

      {/* Account — one card per currency present in the data. */}
      {kpisByCurrency.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Account</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpisByCurrency.map((kpis) => <CurrencyCard key={kpis.currencyCode} kpis={kpis} />)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow — daily collections over the last 30 days, tabbed per
            currency (one axis at a time; currencies are never blended). */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Cash Flow (30 days)</h2>
            {paymentTrendByCurrency.length > 1 && (
              <div className="flex gap-1">
                {paymentTrendByCurrency.map((s) => (
                  <button
                    key={s.currencyCode}
                    onClick={() => setCashFlowCurrency(s.currencyCode)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      s.currencyCode === activeCashFlow?.currencyCode
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {currencyMeta(s.currencyCode).flag} {s.currencyCode}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={activeCashFlow?.data || []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, activeCashFlow?.currencyCode)} />
                <Tooltip formatter={(v: any) => fmt(Number(v), activeCashFlow?.currencyCode)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
                <Bar dataKey="amount" fill={activeCashFlow ? currencyMeta(activeCashFlow.currencyCode).color : BRAND} radius={[4, 4, 0, 0]} name="Collected" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListCard
          title="Money In (last 30 days)"
          icon="↙"
          iconColor="text-emerald-600"
          rows={moneyInByCustomer}
          valueKey="received"
          emptyLabel="No payments received in the last 30 days"
        />
        <ListCard
          title="Outstanding"
          icon="↗"
          iconColor="text-red-600"
          rows={outstandingByCustomer}
          valueKey="outstanding"
          emptyLabel="Nothing outstanding — all invoices settled"
        />
      </div>

      {/* Monthly Collections — 6-month trend, one small chart per currency. */}
      {monthlyCollectionsByCurrency.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {monthlyCollectionsByCurrency.map((series) => (
            <ChartCard
              key={series.currencyCode}
              title={monthlyCollectionsByCurrency.length > 1 ? `Monthly Collections (${series.currencyCode})` : 'Monthly Collections'}
            >
              <ResponsiveContainer>
                <BarChart data={series.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, series.currencyCode)} />
                  <Tooltip formatter={(v: any) => fmt(Number(v), series.currencyCode)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }} />
                  <Bar dataKey="amount" fill={currencyMeta(series.currencyCode).color} radius={[4, 4, 0, 0]} name="Collected" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  );
}
