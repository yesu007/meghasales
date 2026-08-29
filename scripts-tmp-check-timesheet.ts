import { PrismaClient } from '@prisma/client';
import { periodRange, computeLeaveHours, computePaidHolidayHours } from './src/lib/payroll/timesheetEngine';

async function main() {
  const prisma = new PrismaClient();

  let emp = await prisma.employee.findFirst({ orderBy: { id: 'asc' } });
  let createdTestEmployee = false;
  if (!emp) {
    emp = await prisma.employee.create({
      data: { employeeCode: 'TEST-TS-001', firstName: 'Test', lastName: 'Employee', email: 'test-ts-check@example.com', dateOfJoining: new Date('2026-01-01') },
    });
    createdTestEmployee = true;
  }
  console.log('Using employee:', emp.employeeCode, emp.firstName, emp.lastName);

  const year = 2026, month = 8;
  const { start, end } = periodRange(year, month);
  console.log('Period range:', start.toISOString(), '..', end.toISOString());

  // Upsert a TimesheetEntry
  const entry = await prisma.timesheetEntry.upsert({
    where: { employeeId_periodYear_periodMonth: { employeeId: emp.id, periodYear: year, periodMonth: month } },
    update: { regularHours: 160, overtimeHours: 8 },
    create: { employeeId: emp.id, periodYear: year, periodMonth: month, regularHours: 160, overtimeHours: 8 },
  });
  console.log('TimesheetEntry upserted:', entry.id, entry.regularHours.toString(), entry.overtimeHours.toString());

  // Add a holiday inside the period
  const holidayDate = new Date('2026-08-15');
  const holiday = await prisma.paidHoliday.upsert({
    where: { date: holidayDate },
    update: {},
    create: { date: holidayDate, name: 'Independence Day (test)' },
  });
  console.log('Holiday:', holiday.name, holiday.date.toISOString());

  // Approved SICK leave inside the period, to exercise the leave-hours bucketing
  let sickType = await prisma.leaveType.findUnique({ where: { code: 'SICK' } });
  let createdSickType = false;
  if (!sickType) { sickType = await prisma.leaveType.create({ data: { name: 'Sick Leave', code: 'SICK', isPaid: true } }); createdSickType = true; }
  const leaveRequest = await prisma.leaveRequest.create({
    data: { employeeId: emp.id, leaveTypeId: sickType.id, startDate: new Date('2026-08-10'), endDate: new Date('2026-08-11'), days: 2, status: 'APPROVED' },
  });

  const leaveHours = await computeLeaveHours(prisma, emp.id, start, end);
  console.log('Leave hours (expect sickLeaveHours: 16):', leaveHours);

  await prisma.leaveRequest.delete({ where: { id: leaveRequest.id } });
  if (createdSickType) await prisma.leaveType.delete({ where: { id: sickType.id } });

  const holidays = await prisma.paidHoliday.findMany({ where: { isActive: true, date: { gte: start, lte: end } } });
  const paidHolidayHours = computePaidHolidayHours(holidays, start, end, emp);
  console.log('Paid holiday hours:', paidHolidayHours);

  // TimesheetPeriod round-trip
  const period = await prisma.timesheetPeriod.upsert({
    where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
    update: { status: 'SUBMITTED', submittedAt: new Date() },
    create: { periodYear: year, periodMonth: month, status: 'SUBMITTED', submittedAt: new Date() },
  });
  console.log('TimesheetPeriod:', period.status, period.submittedAt);

  // Cleanup test rows so this doesn't leave junk behind
  await prisma.timesheetEntry.delete({ where: { id: entry.id } });
  await prisma.paidHoliday.delete({ where: { id: holiday.id } });
  await prisma.timesheetPeriod.delete({ where: { id: period.id } });
  if (createdTestEmployee) await prisma.employee.delete({ where: { id: emp.id } });
  console.log('Cleaned up test rows. All good.');

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
