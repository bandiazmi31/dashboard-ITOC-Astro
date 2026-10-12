import { stat, readFile } from 'node:fs/promises';
import { parseItocWorkbook, type ItocShiftPayload } from './itoc-summary';

/**
 * Server-only. Returns the Shift ITOC schedule for the navbar badge.
 * The workbook is parsed once and reused until its modification time changes, so a page load
 * costs one stat() call instead of reading and parsing the Excel file again.
 */
let cache: { filePath: string; mtimeMs: number; jadwal: ItocShiftPayload } | null = null;

/** Null when the path is not configured or the file cannot be read; the badge is then hidden */
export async function getItocShiftSchedule(): Promise<ItocShiftPayload | null> {
  // process.env first, same as /api/itoc-summary: a literal path inlined from import.meta.env confuses the Vercel file tracer
  const filePath = process.env.ITOC_SUMMARY_XLSX_PATH || import.meta.env.ITOC_SUMMARY_XLSX_PATH;
  if (!filePath) return null;

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
