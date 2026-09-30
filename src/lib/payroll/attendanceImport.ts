import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getObjectBytes, isStorageConfigured, put } from '@/lib/storage';
import {
  buildLoginLogoutRows, calculateDailyAttendance, deviceIdFromFileName, deviceUtcOffsetMinutes,
  localDayRangeUtc, parseAttendanceLog, parseUserFile, punchKey, utcToLocal, type ParsedPunch,
} from './attendanceLog';
import { buildLoginLogoutWorkbook, parseLoginLogoutWorkbook, XLSX_CONTENT_TYPE } from './attendanceExcel';

type Client = Prisma.TransactionClient | PrismaClient;

// Caps on what's kept in AttendanceImportFile.details for the status screen.
const MAX_INVALID_DETAILS = 50;
const CHUNK = 1000;

export interface ImportInput {
  fileName: string;
  content: Buffer;
  source: 'SFTP' | 'UPLOAD';
  // The device's user.dat, when available (SFTP) — only used for names.
  // Uploaded Login/Logout workbooks carry their own Employee Name column.
  userFile?: Buffer | null;
  fileSize?: number;
  remoteModifiedAt?: Date | null;
  createdById?: number | null;
}

export interface ImportOutcome {
  skipped: boolean; // same file hash already imported
  importFile: Awaited<ReturnType<typeof prisma.attendanceImportFile.findUniqueOrThrow>>;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

// Manual uploads are the Login/Logout workbook; SFTP delivers the device's
// raw attendance log. Which parser runs is decided by the file name.
export const isLoginLogoutWorkbook = (fileName: string) => /\.xlsx$/i.test(fileName);

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function storeFile(pathname: string, content: Buffer, contentType: string): Promise<string> {
  const blob = new Blob([new Uint8Array(content)], { type: contentType });
  const { url } = await put(pathname, blob, { access: 'public', contentType });
  return url;
}

// Entry point for both the SFTP cron and a manual upload. Idempotent at two
// levels: a file whose SHA-256 was already imported is skipped outright
// (unless its previous attempt FAILED, which is retried in place), and
// every punch is keyed (Login User ID, timestamp) so the device's
// cumulative log re-sending old punches — or a workbook repeating punches a
// device log already delivered — never duplicates them.
export async function importAttendanceFile(input: ImportInput): Promise<ImportOutcome> {
  const fileHash = sha256(input.content);
  const existing = await prisma.attendanceImportFile.findUnique({ where: { fileHash } });
  if (existing && existing.status !== 'FAILED') return { skipped: true, importFile: existing };

  let record = existing;
  if (!record) {
    try {
      record = await prisma.attendanceImportFile.create({
        data: {
          fileName: input.fileName,
          fileHash,
          source: input.source,
          deviceId: deviceIdFromFileName(input.fileName),
          fileSize: input.fileSize ?? input.content.length,
          remoteModifiedAt: input.remoteModifiedAt ?? null,
          createdById: input.createdById ?? null,
          status: 'PENDING',
        },
      });
    } catch (err) {
      // Another run (cron vs. manual sync) registered the same file first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await prisma.attendanceImportFile.findUniqueOrThrow({ where: { fileHash } });
        return { skipped: true, importFile: raced };
      }
      throw err;
    }
  }

  // Keep the original log so this import can be re-processed later (e.g.
  // after mapping a previously unmatched ID) without the SFTP copy.
  let rawFileUrl = record.rawFileUrl;
  let storageWarning: string | null = null;
  if (!rawFileUrl && isStorageConfigured()) {
    try {
      rawFileUrl = await storeFile(`attendance-imports/${randomUUID()}/${input.fileName}`, input.content, isLoginLogoutWorkbook(input.fileName) ? XLSX_CONTENT_TYPE : 'text/plain');
      await prisma.attendanceImportFile.update({ where: { id: record.id }, data: { rawFileUrl } });
    } catch (err: any) {
      storageWarning = `Raw file not stored: ${err.message}`;
    }
  }

  const importFile = await processImport(record.id, input.content, input.userFile ?? null, storageWarning);
  return { skipped: false, importFile };
}

// Re-runs an existing import from its stored raw file. Safe to repeat —
// see the idempotency notes on importAttendanceFile.
export async function reprocessImport(importId: number): Promise<ImportOutcome> {
  const record = await prisma.attendanceImportFile.findUniqueOrThrow({ where: { id: importId } });
  if (!record.rawFileUrl) throw new Error('The original file for this import was not stored, so it cannot be re-processed — re-upload it instead');
  const content = await getObjectBytes(record.rawFileUrl);
  const importFile = await processImport(record.id, content, null, null);
  return { skipped: false, importFile };
}

async function processImport(importId: number, content: Buffer, userFile: Buffer | null, storageWarning: string | null) {
  const record = await prisma.attendanceImportFile.update({
    where: { id: importId },
    data: { status: 'PROCESSING', processingStartedAt: new Date(), processingCompletedAt: null, errorMessage: null },
  });
  const offset = deviceUtcOffsetMinutes();
  const deviceId = record.deviceId || deviceIdFromFileName(record.fileName);

  try {
    // 1. Parse + validate every row.
    const workbook = isLoginLogoutWorkbook(record.fileName) ? await parseLoginLogoutWorkbook(content, offset) : null;
    const { punches: parsed, invalid, totalRecords } = workbook ?? parseAttendanceLog(content.toString('utf8'), offset);
    // Nothing usable at all — still record the counts and the row errors so
    // the status screen shows why, rather than a bare FAILED with zeros.
    if (totalRecords > 0 && parsed.length === 0) {
      return await prisma.attendanceImportFile.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          processingCompletedAt: new Date(),
          totalRecords,
          successfulRecords: 0,
          duplicateRecords: 0,
          invalidRecords: invalid.length,
          unmatchedRecords: 0,
          unmatchedEmployees: 0,
          errorMessage: `No valid rows in file — first error: line ${invalid[0]?.line}: ${invalid[0]?.reason}`,
          details: { dateRange: null, invalidRows: invalid.slice(0, MAX_INVALID_DETAILS) as unknown as Prisma.InputJsonArray, unmatchedIds: [], deviceNames: {} },
        },
      });
    }

    // Names: the workbook's own column / a freshly supplied user.dat, else
    // what a previous run of this same import saved.
    const prevDetails = (record.details as Record<string, any> | null) || {};
    const names = workbook ? workbook.names : userFile ? parseUserFile(userFile) : new Map<string, string>(Object.entries(prevDetails.deviceNames || {}));

    // Counts are per file row (a workbook row carries a login and a logout
    // punch; a device-log row is one punch): a row is unmatched if its ID
    // isn't mapped, imported if any of its punches is new, else duplicate.
    const rowOutcome = new Map<number, 'duplicate' | 'imported' | 'unmatched'>();
    const setOutcome = (line: number, outcome: 'duplicate' | 'imported' | 'unmatched') => {
      const cur = rowOutcome.get(line);
      if (!cur || outcome === 'unmatched' || (outcome === 'imported' && cur === 'duplicate')) rowOutcome.set(line, outcome);
    };

    // 2. Duplicates inside the file itself.
    const seen = new Set<string>();
    const unique: ParsedPunch[] = [];
    for (const p of parsed) {
      const key = punchKey(p.accessControlId, p.punchAt);
      if (seen.has(key)) { setOutcome(p.line, 'duplicate'); continue; }
      seen.add(key);
      unique.push(p);
    }

    // 3. Access Control ID → Employee (never by name, never auto-created).
    const ids = Array.from(new Set(unique.map((p) => p.accessControlId)));
    const employees = await prisma.employee.findMany({ where: { accessControlId: { in: ids } }, select: { id: true, accessControlId: true, firstName: true, lastName: true } });
    const employeeByAccessId = new Map(employees.map((e) => [e.accessControlId!, e]));

    // 4. Duplicates against punches already stored (earlier files, any source).
    let minAt = unique[0]?.punchAt ?? new Date();
    let maxAt = minAt;
    for (const p of unique) {
      if (p.punchAt < minAt) minAt = p.punchAt;
      if (p.punchAt > maxAt) maxAt = p.punchAt;
    }
    const stored = unique.length
      ? await prisma.attendancePunch.findMany({
          where: { punchAt: { gte: minAt, lte: maxAt } },
          select: { id: true, accessControlId: true, punchAt: true, employeeId: true },
        })
      : [];
    const storedByKey = new Map(stored.map((s) => [punchKey(s.accessControlId, s.punchAt), s]));

    const toInsert: Prisma.AttendancePunchCreateManyInput[] = [];
    const relinkIds: number[] = [];
    const relinkEmployeeFor = new Map<number, number>();
    const affected = new Map<number, Set<string>>(); // employeeId → local dates to recalculate
    const unmatchedLines = new Map<string, Set<number>>();

    const markAffected = (employeeId: number, date: string) => {
      if (!affected.has(employeeId)) affected.set(employeeId, new Set());
      affected.get(employeeId)!.add(date);
    };

    for (const p of unique) {
      const emp = employeeByAccessId.get(p.accessControlId);
      const already = storedByKey.get(punchKey(p.accessControlId, p.punchAt));
      if (!emp) {
        setOutcome(p.line, 'unmatched');
        if (!unmatchedLines.has(p.accessControlId)) unmatchedLines.set(p.accessControlId, new Set());
        unmatchedLines.get(p.accessControlId)!.add(p.line);
      }
      if (already) {
        if (emp) setOutcome(p.line, 'duplicate');
        // Stored earlier while this ID was still unmapped — claim it now.
        if (emp && already.employeeId == null) {
          relinkIds.push(already.id);
          relinkEmployeeFor.set(already.id, emp.id);
          markAffected(emp.id, p.localDate);
        }
        continue;
      }
      // Unmatched punches are still stored (employeeId null) so mapping
      // the ID later backfills attendance without needing this file again.
      toInsert.push({
        employeeId: emp?.id ?? null,
        accessControlId: p.accessControlId,
        punchAt: p.punchAt,
        punchType: p.punchType,
        verifyMode: p.verifyMode,
        deviceId,
        source: record.source,
        sourceFile: record.fileName,
        importFileId: record.id,
      });
      if (emp) {
        setOutcome(p.line, 'imported');
        markAffected(emp.id, p.localDate);
      }
    }
    const outcomes = Array.from(rowOutcome.values());
    const successfulRecords = outcomes.filter((o) => o === 'imported').length;
    const duplicateRecords = outcomes.filter((o) => o === 'duplicate').length;
    const unmatchedRecords = outcomes.filter((o) => o === 'unmatched').length;
    const unmatched = new Map(Array.from(unmatchedLines).map(([id, lines]) => [id, lines.size]));

    // 5. Store raw punches. skipDuplicates keeps a concurrent run of an
    // overlapping file from failing on the unique key.
    for (const batch of chunks(toInsert)) {
      await prisma.attendancePunch.createMany({ data: batch, skipDuplicates: true });
    }
    const relinkByEmployee = new Map<number, number[]>();
    for (const id of relinkIds) {
      const empId = relinkEmployeeFor.get(id)!;
      relinkByEmployee.set(empId, [...(relinkByEmployee.get(empId) || []), id]);
    }
    for (const [employeeId, punchIds] of Array.from(relinkByEmployee)) {
      await prisma.attendancePunch.updateMany({ where: { id: { in: punchIds }, employeeId: null }, data: { employeeId } });
    }

    // 6. Daily summaries for every employee/day this file touched.
    for (const [employeeId, dates] of Array.from(affected)) {
      await recalculateDailyAttendance(prisma, employeeId, Array.from(dates));
    }

    // 7. Normalized Login/Logout workbook → S3 (when storage is configured).
    let excelFileUrl = record.excelFileUrl;
    const allNames = new Map(names);
    for (const e of employees) if (!allNames.get(e.accessControlId!)) allNames.set(e.accessControlId!, `${e.firstName} ${e.lastName}`.trim());
    if (isStorageConfigured()) {
      try {
        const normalized = await buildLoginLogoutWorkbook(buildLoginLogoutRows(unique, allNames));
        const base = record.fileName.replace(/\.[^.]+$/, '');
        excelFileUrl = await storeFile(`attendance-imports/${randomUUID()}/${base}_login_logout.xlsx`, normalized, XLSX_CONTENT_TYPE);
      } catch (err: any) {
        storageWarning = [storageWarning, `Excel not stored: ${err.message}`].filter(Boolean).join('; ');
      }
    }

    const localDates = unique.map((p) => p.localDate).sort();
    const status = invalid.length > 0 || unmatchedRecords > 0 ? 'PARTIAL' : 'COMPLETED';
    const partialReasons = [
      invalid.length ? `${invalid.length} invalid row(s)` : null,
      unmatched.size ? `${unmatched.size} Login User ID(s) not mapped to any employee` : null,
    ].filter(Boolean);

    return await prisma.attendanceImportFile.update({
      where: { id: record.id },
      data: {
        status,
        processingCompletedAt: new Date(),
        totalRecords,
        successfulRecords,
        duplicateRecords,
        invalidRecords: invalid.length,
        unmatchedRecords,
        unmatchedEmployees: unmatched.size,
        excelFileUrl,
        errorMessage: [partialReasons.join(', ') || null, storageWarning].filter(Boolean).join(' · ') || null,
        details: {
          dateRange: localDates.length ? { from: localDates[0], to: localDates[localDates.length - 1] } : null,
          invalidRows: invalid.slice(0, MAX_INVALID_DETAILS) as unknown as Prisma.InputJsonArray,
          unmatchedIds: Array.from(unmatched.entries())
            .sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
            .map(([accessControlId, rows]) => ({ accessControlId, name: names.get(accessControlId) || null, rows })),
          deviceNames: Object.fromEntries(names),
        },
      },
    });
  } catch (err: any) {
    console.error(`[attendance-import] ${record.fileName} failed:`, err);
    return prisma.attendanceImportFile.update({
      where: { id: record.id },
      data: { status: 'FAILED', processingCompletedAt: new Date(), errorMessage: String(err?.message || err).slice(0, 1000) },
    });
  }
}

// Rebuilds DailyAttendanceSummary for one employee on the given device-
// local dates, purely from AttendancePunch. A date with no punches left
// (e.g. after an Access Control ID was re-mapped) loses its summary row.
export async function recalculateDailyAttendance(tx: Client, employeeId: number, localDates: string[]): Promise<void> {
  if (localDates.length === 0) return;
  const offset = deviceUtcOffsetMinutes();
  const sorted = Array.from(new Set(localDates)).sort();
  const { start, end } = localDayRangeUtc(sorted[0], sorted[sorted.length - 1], offset);
  const punches = await tx.attendancePunch.findMany({
    where: { employeeId, punchAt: { gte: start, lte: end } },
    select: { punchAt: true, punchType: true },
    orderBy: { punchAt: 'asc' },
  });
  const byDate = new Map<string, typeof punches>();
  for (const p of punches) {
    const { date } = utcToLocal(p.punchAt, offset);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(p);
  }

  const calculatedAt = new Date();
  for (const date of sorted) {
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);
    const dayPunches = byDate.get(date) || [];
    if (dayPunches.length === 0) {
      await tx.dailyAttendanceSummary.deleteMany({ where: { employeeId, attendanceDate } });
      continue;
    }
    const r = calculateDailyAttendance(dayPunches);
    const data = {
      loginTime: r.loginTime,
      logoutTime: r.logoutTime,
      totalWorkingMinutes: r.totalWorkingMinutes,
      sessionCount: r.sessionCount,
      punchCount: r.punchCount,
      status: r.status,
      calculatedAt,
    };
    await tx.dailyAttendanceSummary.upsert({
      where: { employeeId_attendanceDate: { employeeId, attendanceDate } },
      update: data,
      create: { employeeId, attendanceDate, ...data },
    });
  }
}

// Called when HR sets/changes an employee's Access Control ID: punches
// stored under the old ID are released back to unmatched, punches waiting
// under the new ID are claimed, and every affected day is recalculated.
export async function relinkPunchesForEmployee(employeeId: number, oldAccessId: string | null, newAccessId: string | null): Promise<void> {
  if (oldAccessId === newAccessId) return;
  const offset = deviceUtcOffsetMinutes();
  const dates = new Set<string>();

  if (oldAccessId) {
    const released = await prisma.attendancePunch.findMany({ where: { employeeId, accessControlId: oldAccessId }, select: { punchAt: true } });
    released.forEach((p) => dates.add(utcToLocal(p.punchAt, offset).date));
    await prisma.attendancePunch.updateMany({ where: { employeeId, accessControlId: oldAccessId }, data: { employeeId: null } });
  }
  if (newAccessId) {
    const claimed = await prisma.attendancePunch.findMany({ where: { employeeId: null, accessControlId: newAccessId }, select: { punchAt: true } });
    claimed.forEach((p) => dates.add(utcToLocal(p.punchAt, offset).date));
    await prisma.attendancePunch.updateMany({ where: { employeeId: null, accessControlId: newAccessId }, data: { employeeId } });
  }
  await recalculateDailyAttendance(prisma, employeeId, Array.from(dates));
}

// Workbook for an import's download button. Uses the stored S3/Blob copy
// when there is one; otherwise rebuilds the same sheet from the stored
// punches for that device and date range (matched and unmatched alike).
export async function getImportWorkbook(importId: number): Promise<{ fileName: string; content: Buffer }> {
  const record = await prisma.attendanceImportFile.findUniqueOrThrow({ where: { id: importId } });
  const base = record.fileName.replace(/\.[^.]+$/, '');
  const fileName = `${base}_login_logout.xlsx`;
  if (record.excelFileUrl) return { fileName, content: await getObjectBytes(record.excelFileUrl) };

  const details = (record.details as Record<string, any> | null) || {};
  const range = details.dateRange as { from: string; to: string } | null;
  if (!range) throw new Error('This import has no attendance rows to export');
  const offset = deviceUtcOffsetMinutes();
  const { start, end } = localDayRangeUtc(range.from, range.to, offset);
  const punches = await prisma.attendancePunch.findMany({
    where: { punchAt: { gte: start, lte: end } },
    select: { accessControlId: true, punchAt: true, employee: { select: { firstName: true, lastName: true } } },
  });
  const names = new Map<string, string>(Object.entries(details.deviceNames || {}));
  for (const p of punches) if (!names.get(p.accessControlId) && p.employee) names.set(p.accessControlId, `${p.employee.firstName} ${p.employee.lastName}`.trim());
  const rows = buildLoginLogoutRows(
    punches.map((p) => ({ accessControlId: p.accessControlId, ...(({ date, time }) => ({ localDate: date, localTime: time }))(utcToLocal(p.punchAt, offset)) })),
    names
  );
  return { fileName, content: await buildLoginLogoutWorkbook(rows) };
}

// Deletes an import together with the punches it added, then rebuilds the
// daily attendance for every employee/day those punches touched. Punches
// an earlier import already had (counted as duplicates here) belong to that
// earlier import and are untouched. The hash goes with the record, so the
// same file can be uploaded again afterwards.
export async function deleteImport(importId: number): Promise<{ fileName: string; punchesRemoved: number }> {
  const record = await prisma.attendanceImportFile.findUniqueOrThrow({ where: { id: importId } });
  if (record.status === 'PROCESSING') throw new Error('This import is still processing — try again once it finishes');

  const offset = deviceUtcOffsetMinutes();
  const punches = await prisma.attendancePunch.findMany({ where: { importFileId: importId }, select: { employeeId: true, punchAt: true } });
  const affected = new Map<number, Set<string>>();
  for (const p of punches) {
    if (p.employeeId == null) continue;
    if (!affected.has(p.employeeId)) affected.set(p.employeeId, new Set());
    affected.get(p.employeeId)!.add(utcToLocal(p.punchAt, offset).date);
  }

  const [removed] = await prisma.$transaction([
    prisma.attendancePunch.deleteMany({ where: { importFileId: importId } }),
    prisma.attendanceImportFile.delete({ where: { id: importId } }),
  ]);
  for (const [employeeId, dates] of Array.from(affected)) {
    await recalculateDailyAttendance(prisma, employeeId, Array.from(dates));
  }
  return { fileName: record.fileName, punchesRemoved: removed.count };
}
