import prisma from '@/lib/prisma';

export type PayrollReportType = 'salary-register' | 'department-cost' | 'ytd-earnings';

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
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

async function buildSalaryRegisterReport(filters: ReportFilters): Promise<ReportResult> {
  if (!filters.runId) throw new Error('runId is required for the salary register report');
  const runId = parseInt(filters.runId);

  const payslips = await prisma.payslip.findMany({
    where: { runId },
    include: { employee: { select: { employeeCode: true, department: true, designation: true, user: { select: { firstName: true, lastName: true } } } } },
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
      name: `${p.employee.user.firstName} ${p.employee.user.lastName}`,
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
    include: { employee: { select: { employeeCode: true, user: { select: { firstName: true, lastName: true } } } } },
  });

  const byEmployee: Record<number, { employeeCode: string; name: string; months: number; gross: number; deductions: number; net: number }> = {};
  for (const p of payslips) {
    if (!byEmployee[p.employeeId]) {
      byEmployee[p.employeeId] = { employeeCode: p.employee.employeeCode, name: `${p.employee.user.firstName} ${p.employee.user.lastName}`, months: 0, gross: 0, deductions: 0, net: 0 };
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
