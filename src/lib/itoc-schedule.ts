import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseItocWorkbook, type ItocShiftPayload } from './itoc-summary';

/** Used when ITOC_SUMMARY_XLSX_PATH is not set: the workbook kept in public/ */
const DEFAULT_ITOC_SUMMARY_FILE = 'Summary Data ITOC & EOS.xlsx';

/** Server-only. Env var first (process.env: a literal path inlined from import.meta.env confuses the Vercel file tracer), then public/ */
export function resolveItocSummaryPath(): string {
  return (
    process.env.ITOC_SUMMARY_XLSX_PATH ||
    import.meta.env.ITOC_SUMMARY_XLSX_PATH ||
    path.resolve(process.cwd(), 'public', DEFAULT_ITOC_SUMMARY_FILE)
  );
}

/**
 * Server-only. Returns the Shift ITOC schedule for the navbar badge.
 * The workbook is parsed once and reused until its modification time changes, so a page load
 * costs one stat() call instead of reading and parsing the Excel file again.
 */
let cache: { filePath: string; mtimeMs: number; jadwal: ItocShiftPayload } | null = null;

/** Null when the path is not configured or the file cannot be read; the badge is then hidden */
export async function getItocShiftSchedule(): Promise<ItocShiftPayload | null> {
  const filePath = resolveItocSummaryPath();

  try {
    const { mtimeMs } = await stat(filePath);
    if (cache && cache.filePath === filePath && cache.mtimeMs === mtimeMs) {
      return cache.jadwal;
    }

    const jadwal = parseItocWorkbook(await readFile(filePath)).jadwal;
    cache = { filePath, mtimeMs, jadwal };
    return jadwal;
  } catch (err) {
    console.error('[ITOC SCHEDULE] Gagal membaca jadwal untuk navbar:', err);
    return null;
  }
}
