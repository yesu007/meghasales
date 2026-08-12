import prisma from '@/lib/prisma';
import { round2 } from '@/lib/payroll/runEngine';

export type PayrollReportType = 'salary-register' | 'department-cost' | 'ytd-earnings' | 'pf-contribution' | 'esi-contribution' | 'pt-summary';

export interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
export interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[] }

interface ReportFilters { runId?: string; year?: string; month?: string }

// A payroll figure only counts once its run has actually been approved —
// a DRAFT run's numbers can still change under a PATCH, and a CANCELLED
// run never happened. Same three statuses my-payslips/route.ts uses for
// the self-service view, for the same reason.
const FINAL_STATUSES = ['APPROVED', 'PROCESSED', 'PAID'];

export async function buildReport(type: PayrollReportType, filters: ReportFilters): Promise<ReportResult> {
  switch (type) {
    case 'salary-register':
      return buildSalaryRegisterReport(filters);
    case 'department-cost':
      return buildDepartmentCostReport(filters);
    case 'ytd-earnings':
      return buildYtdEarningsReport(filters);
    case 'pf-contribution':
      return buildPfContributionReport(filters);
    case 'esi-contribution':
      return buildEsiContributionReport(filters);
    case 'pt-summary':
      return buildPtSummaryReport(filters);
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

async function buildSalaryRegisterReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.runId) throw new Error('runId is required for the salary register report');
  const runId = parseInt(filters.runId);

  const payslips = await prisma.payslip.findMany({
    where: { runId },
    include: { employee: { select: { employeeCode: true, department: true, designation: true, firstName: true, lastName: true} } },
    orderBy: { employeeId: 'asc' },
  });

  return {
    title: 'Salary Register',
    columns: [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'name', label: 'Name' },
      { key: 'department', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      { key: 'payableDays', label: 'Payable Days', align: 'right', type: 'number' },
      { key: 'grossEarnings', label: 'Gross Earnings', align: 'right', type: 'currency' },
      { key: 'totalDeductions', label: 'Total Deductions', align: 'right', type: 'currency' },
      { key: 'netPay', label: 'Net Pay', align: 'right', type: 'currency' },
    ],
    rows: payslips.map((p) => ({
      employeeCode: p.employee.employeeCode,
      name: `${p.employee.firstName} ${p.employee.lastName}`,
      department: p.employee.department || '—',
      designation: p.employee.designation || '—',
      payableDays: Number(p.payableDays),
      grossEarnings: Number(p.grossEarnings),
      totalDeductions: Number(p.totalDeductions),
      netPay: Number(p.netPay),
    })),
  };
}

async function buildDepartmentCostReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.year) throw new Error('year is required for the department cost report');
  const year = parseInt(filters.year);
  const month = filters.month ? parseInt(filters.month) : undefined;

  const payslips = await prisma.payslip.findMany({
    where: { run: { payPeriodYear: year, ...(month ? { payPeriodMonth: month } : {}), status: { in: FINAL_STATUSES } } },
    include: { employee: { select: { department: true } } },
  });

  const byDept: Record<string, { employeeCount: number; gross: number; deductions: number; net: number }> = {};
  for (const p of payslips) {
    const dept = p.employee.department || 'Unassigned';
    if (!byDept[dept]) byDept[dept] = { employeeCount: 0, gross: 0, deductions: 0, net: 0 };
    byDept[dept].employeeCount += 1;
    byDept[dept].gross += Number(p.grossEarnings);
    byDept[dept].deductions += Number(p.totalDeductions);
    byDept[dept].net += Number(p.netPay);
  }

  return {
    title: month ? `Department Cost — ${month}/${year}` : `Department Cost — ${year}`,
    columns: [
      { key: 'department', label: 'Department' },
      { key: 'employeeCount', label: 'Payslips', align: 'right', type: 'number' },
      { key: 'gross', label: 'Gross Earnings', align: 'right', type: 'currency' },
      { key: 'deductions', label: 'Total Deductions', align: 'right', type: 'currency' },
      { key: 'net', label: 'Net Pay', align: 'right', type: 'currency' },
    ],
    rows: Object.entries(byDept)
      .map(([department, v]) => ({ department, ...v }))
      .sort((a, b) => b.net - a.net),
  };
}

async function buildYtdEarningsReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.year) throw new Error('year is required for the YTD earnings report');
  const year = parseInt(filters.year);

  const payslips = await prisma.payslip.findMany({
    where: { run: { payPeriodYear: year, status: { in: FINAL_STATUSES } } },
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true} } },
  });

  const byEmployee: Record<number, { employeeCode: string; name: string; months: number; gross: number; deductions: number; net: number }> = {};
  for (const p of payslips) {
    if (!byEmployee[p.employeeId]) {
      byEmployee[p.employeeId] = { employeeCode: p.employee.employeeCode, name: `${p.employee.firstName} ${p.employee.lastName}`, months: 0, gross: 0, deductions: 0, net: 0 };
    }
    const bucket = byEmployee[p.employeeId];
    bucket.months += 1;
    bucket.gross += Number(p.grossEarnings);
    bucket.deductions += Number(p.totalDeductions);
    bucket.net += Number(p.netPay);
  }

  return {
    title: `YTD Earnings — ${year}`,
    columns: [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'name', label: 'Name' },
      { key: 'months', label: 'Months Paid', align: 'right', type: 'number' },
      { key: 'gross', label: 'Gross Earnings', align: 'right', type: 'currency' },
      { key: 'deductions', label: 'Total Deductions', align: 'right', type: 'currency' },
      { key: 'net', label: 'Net Pay', align: 'right', type: 'currency' },
    ],
    rows: Object.values(byEmployee).sort((a, b) => b.net - a.net),
  };
}

// The numbers a human re-types into the EPFO/ESIC portals — this doesn't
// file anything itself. Employer contribution is reconstructed rather than
// read from a stored line item (employer PF/ESI were deliberately never
// modeled as payslip line items — that would incorrectly reduce net pay,
// see CompanyProfile.pfEmployerRate's schema comment), so it's an estimate
// derived from the same base the employee side was computed against, not
// a second independently-tracked figure.
async function buildPfContributionReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.runId) throw new Error('runId is required for the PF contribution report');
  const runId = parseInt(filters.runId);

  const [payslips, profile] = await Promise.all([
    prisma.payslip.findMany({
      where: { runId },
      include: {
        employee: { select: { employeeCode: true, uanNumber: true, firstName: true, lastName: true} },
        lineItems: { include: { component: true } },
      },
    }),
    prisma.companyProfile.findFirst({ select: { pfWageCeiling: true, pfEmployerRate: true } }),
  ]);

  const pfWageCeiling = profile?.pfWageCeiling != null ? Number(profile.pfWageCeiling) : null;
  const employerRate = profile?.pfEmployerRate != null ? Number(profile.pfEmployerRate) : 12;

  const rows = payslips
    .map((p) => {
      const pfItem = p.lineItems.find((li) => li.component?.statutoryType === 'PF');
      if (!pfItem || Number(pfItem.amount) === 0) return null;

      const basicItem = p.lineItems.find((li) => li.component?.code === 'BASIC');
      const basicAmount = basicItem ? Number(basicItem.amount) : 0;
      const totalDays = p.totalDays;
      const payableDays = Number(p.payableDays);
      // The ceiling is a full-month figure; the Basic line item is already
      // pro-rated, so the ceiling has to be pro-rated by the same ratio to
      // compare on the same footing (mirrors runEngine.ts's own approach
      // of resolving full-month, then scaling the whole result).
      const effectiveCeiling = pfWageCeiling != null && totalDays > 0 ? round2(pfWageCeiling * (payableDays / totalDays)) : null;
      const cappedBasic = effectiveCeiling != null ? Math.min(basicAmount, effectiveCeiling) : basicAmount;
      const employeeContribution = Number(pfItem.amount);
      const employerContribution = round2((cappedBasic * employerRate) / 100);

      return {
        employeeCode: p.employee.employeeCode,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        uan: p.employee.uanNumber || '—',
        employeeContribution,
        employerContribution,
        total: round2(employeeContribution + employerContribution),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    title: 'PF Contribution Statement (employer share estimated)',
    columns: [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'name', label: 'Name' },
      { key: 'uan', label: 'UAN' },
      { key: 'employeeContribution', label: 'Employee PF', align: 'right', type: 'currency' },
      { key: 'employerContribution', label: 'Employer PF (est.)', align: 'right', type: 'currency' },
      { key: 'total', label: 'Total Remittance', align: 'right', type: 'currency' },
    ],
    rows,
  };
}

async function buildEsiContributionReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.runId) throw new Error('runId is required for the ESI contribution report');
  const runId = parseInt(filters.runId);

  const [payslips, profile] = await Promise.all([
    prisma.payslip.findMany({
      where: { runId },
      include: {
        employee: { select: { employeeCode: true, esicNumber: true, firstName: true, lastName: true} },
        lineItems: { include: { component: true } },
      },
    }),
    prisma.companyProfile.findFirst({ select: { esiEmployerRate: true } }),
  ]);

  const employerRate = profile?.esiEmployerRate != null ? Number(profile.esiEmployerRate) : 3.25;

  const rows = payslips
    .map((p) => {
      const esiItem = p.lineItems.find((li) => li.component?.statutoryType === 'ESI');
      if (!esiItem || Number(esiItem.amount) === 0) return null; // not ESI-eligible this period (gross exceeded the threshold, or no ESI component at all)

      // ESI, unlike PF, is computed on gross rather than Basic — and gross
      // is already a column on the payslip itself, so no line-item lookup
      // is needed to reconstruct the employer side's base.
      const employeeContribution = Number(esiItem.amount);
      const employerContribution = round2((Number(p.grossEarnings) * employerRate) / 100);

      return {
        employeeCode: p.employee.employeeCode,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        esicNumber: p.employee.esicNumber || '—',
        employeeContribution,
        employerContribution,
        total: round2(employeeContribution + employerContribution),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    title: 'ESI Contribution Statement (employer share estimated)',
    columns: [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'name', label: 'Name' },
      { key: 'esicNumber', label: 'ESIC No.' },
      { key: 'employeeContribution', label: 'Employee ESI', align: 'right', type: 'currency' },
      { key: 'employerContribution', label: 'Employer ESI (est.)', align: 'right', type: 'currency' },
      { key: 'total', label: 'Total Remittance', align: 'right', type: 'currency' },
    ],
    rows,
  };
}

// PT has no employer side — it's a state tax on the employee, full stop —
// so this is a straight list of what was actually deducted, for filing
// against the company's PT registration.
async function buildPtSummaryReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.runId) throw new Error('runId is required for the PT summary report');
  const runId = parseInt(filters.runId);

  const payslips = await prisma.payslip.findMany({
    where: { runId },
    include: {
      employee: { select: { employeeCode: true, firstName: true, lastName: true} },
      lineItems: { include: { component: true } },
    },
  });

  const rows = payslips
    .map((p) => {
      const ptItem = p.lineItems.find((li) => li.component?.statutoryType === 'PT');
      if (!ptItem || Number(ptItem.amount) === 0) return null;
      return {
        employeeCode: p.employee.employeeCode,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        amount: Number(ptItem.amount),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    title: 'Professional Tax Summary',
    columns: [
      { key: 'employeeCode', label: 'Employee Code' },
      { key: 'name', label: 'Name' },
      { key: 'amount', label: 'PT Deducted', align: 'right', type: 'currency' },
    ],
    rows,
  };
}
