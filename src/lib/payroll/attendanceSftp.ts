import SftpClient from 'ssh2-sftp-client';
import prisma from '@/lib/prisma';
import { importAttendanceFile } from './attendanceImport';

// SFTP drop the Access Control device (or its sync agent) writes its
// attendance log to. Everything comes from the environment — no host,
// user, password or key ever lives in source or the DB:
//   ATTENDANCE_SFTP_HOST, ATTENDANCE_SFTP_PORT (22), ATTENDANCE_SFTP_USERNAME,
//   ATTENDANCE_SFTP_PASSWORD and/or ATTENDANCE_SFTP_PRIVATE_KEY (PEM, or
//   base64 of it) + ATTENDANCE_SFTP_PASSPHRASE,
//   ATTENDANCE_SFTP_REMOTE_DIR (/), ATTENDANCE_SFTP_FILE_PATTERN
//   (regex, default "_attlog\.(dat|dot)$"), ATTENDANCE_SFTP_USER_FILE
//   (user.dat — optional, device names only).
export function isAttendanceSftpConfigured(): boolean {
  return !!(process.env.ATTENDANCE_SFTP_HOST && process.env.ATTENDANCE_SFTP_USERNAME && (process.env.ATTENDANCE_SFTP_PASSWORD || process.env.ATTENDANCE_SFTP_PRIVATE_KEY));
}

function privateKey(): string | undefined {
  const raw = process.env.ATTENDANCE_SFTP_PRIVATE_KEY;
  if (!raw) return undefined;
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n');
  return Buffer.from(raw, 'base64').toString('utf8');
}

export interface SftpSyncFileResult {
  fileName: string;
  result: 'IMPORTED' | 'UNCHANGED' | 'DUPLICATE' | 'FAILED';
  importId?: number;
  status?: string;
  error?: string;
}

export interface SftpSyncResult {
  configured: boolean;
  files: SftpSyncFileResult[];
}

// Lists the remote directory and imports every attendance log that is new
// since the last run. A file is only downloaded when its name/size/mtime
// differ from what was last imported under that name; the content hash
// check inside importAttendanceFile is the real duplicate guard.
export async function syncAttendanceFromSftp(createdById: number | null = null): Promise<SftpSyncResult> {
  if (!isAttendanceSftpConfigured()) return { configured: false, files: [] };

  const remoteDir = (process.env.ATTENDANCE_SFTP_REMOTE_DIR || '/').replace(/\/+$/, '') || '/';
  const pattern = new RegExp(process.env.ATTENDANCE_SFTP_FILE_PATTERN || '_attlog\\.(dat|dot)$', 'i');
  const userFileName = process.env.ATTENDANCE_SFTP_USER_FILE || 'user.dat';
  const join = (name: string) => (remoteDir === '/' ? `/${name}` : `${remoteDir}/${name}`);

  const sftp = new SftpClient('attendance-import');
  const files: SftpSyncFileResult[] = [];
  try {
    await sftp.connect({
      host: process.env.ATTENDANCE_SFTP_HOST,
      port: parseInt(process.env.ATTENDANCE_SFTP_PORT || '22', 10),
      username: process.env.ATTENDANCE_SFTP_USERNAME,
      password: process.env.ATTENDANCE_SFTP_PASSWORD || undefined,
      privateKey: privateKey(),
      passphrase: process.env.ATTENDANCE_SFTP_PASSPHRASE || undefined,
      readyTimeout: 20_000,
    });

    const listing = await sftp.list(remoteDir);
    const logs = listing.filter((f) => f.type === '-' && pattern.test(f.name)).sort((a, b) => a.modifyTime - b.modifyTime);
    const userEntry = listing.find((f) => f.type === '-' && f.name.toLowerCase() === userFileName.toLowerCase());

    let userFile: Buffer | null = null;
    for (const f of logs) {
      const remoteModifiedAt = new Date(f.modifyTime);
      const seen = await prisma.attendanceImportFile.findFirst({
        where: { fileName: f.name, fileSize: f.size, remoteModifiedAt, status: { not: 'FAILED' } },
        select: { id: true },
      });
      if (seen) { files.push({ fileName: f.name, result: 'UNCHANGED', importId: seen.id }); continue; }

      try {
        if (userEntry && !userFile) {
          try { userFile = (await sftp.get(join(userEntry.name))) as Buffer; } catch { userFile = null; }
        }
        const content = (await sftp.get(join(f.name))) as Buffer;
        const { skipped, importFile } = await importAttendanceFile({
          fileName: f.name, content, source: 'SFTP', userFile, fileSize: f.size, remoteModifiedAt, createdById,
        });
        files.push({ fileName: f.name, result: skipped ? 'DUPLICATE' : importFile.status === 'FAILED' ? 'FAILED' : 'IMPORTED', importId: importFile.id, status: importFile.status, error: importFile.status === 'FAILED' ? importFile.errorMessage || undefined : undefined });
      } catch (err: any) {
        files.push({ fileName: f.name, result: 'FAILED', error: err.message });
      }
    }
  } finally {
    await sftp.end().catch(() => undefined);
  }
  return { configured: true, files };
}
