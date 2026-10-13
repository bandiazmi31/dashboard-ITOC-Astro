import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { isValidDate } from '../../../lib/dates';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50000;
const INSERT_CHUNK_SIZE = 1000;
const K_COLUMNS = Array.from({ length: 15 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`);
const REQUIRED_HEADERS = ['Laporan', ...K_COLUMNS];

// Report types whose K01 holds the row's own date, e.g. "Wed, Oct 7, 2026".
// Every other type takes the date picked in the upload widget.
const DATED_REPORT_TYPES = new Set(['SOC-Threat-Summary', 'SOC-URL-Summary', 'SOC-AppStats-Historical']);
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const badRequest = (error: string, status = 400) => jsonResponse({ error }, status);

/** "Wed, Oct 7, 2026" -> "2026-10-07", or null when the text is not in that form */
function parseReportDate(text: string): string | null {
  const match = /^[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const monthName = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  const month = MONTHS[monthName];
  if (!month) return null;
  const iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

/** Excel cell -> trimmed text, or null for empty and NaN cells */
function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  return text === '' || text.toLowerCase() === 'nan' ? null : text;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // /api/soc is skipped by the middleware gate, so this route must check the session itself
    const supabase = createSupabaseServerClient(cookies);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return badRequest('Unauthorized: Harap login terlebih dahulu.', 401);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest('Permintaan harus berupa form-data dengan field "file", "period_from", dan "period_to".');
    }

    const file = form.get('file');
    const periodFrom = String(form.get('period_from') ?? '').trim();
    const periodTo = String(form.get('period_to') ?? '').trim();

    if (!(file instanceof File)) {
      return badRequest('File tidak ditemukan. Pilih file Excel (.xlsx).');
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return badRequest('Format file harus .xlsx atau .xls.');
    }
    if (file.size === 0) {
      return badRequest('File kosong.');
    }
    if (file.size > MAX_FILE_BYTES) {
      return badRequest('File terlalu besar (maksimal 10 MB).', 413);
    }
    if (!isValidDate(periodFrom) || !isValidDate(periodTo) || periodFrom > periodTo) {
      return badRequest('Periode tidak valid: isi tanggal awal dan akhir (YYYY-MM-DD), awal tidak boleh setelah akhir.');
    }

    let rawRows: Record<string, unknown>[];
    try {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null }) : [];
    } catch (err) {
      console.error('[SOC UPLOAD] Excel parse failed:', err);
      return badRequest('File Excel tidak dapat dibaca.');
    }

    if (rawRows.length === 0) {
      return badRequest('Sheet pertama kosong.');
    }
    if (rawRows.length > MAX_ROWS) {
      return badRequest(`Terlalu banyak baris (maksimal ${MAX_ROWS}).`);
    }

    const missingHeaders = REQUIRED_HEADERS.filter(h => !(h in rawRows[0]));
    if (missingHeaders.length > 0) {
      return badRequest(`Kolom tidak ditemukan: ${missingHeaders.join(', ')}`);
    }

    // File and Jumlah file are intentionally ignored
    const rows: Record<string, string | null>[] = [];
    const datedTypes = new Set<string>();
    const datedDates = new Set<string>();
    const undatedTypes = new Set<string>();
    for (let i = 0; i < rawRows.length; i++) {
      const source = rawRows[i];
      const laporanType = toText(source['Laporan']);
      if (laporanType === null) continue; // blank spreadsheet rows

      // Dated types cover one day (their K01 date); every other type covers the picked period
      let rowFrom = periodFrom;
      let rowTo = periodTo;
      if (DATED_REPORT_TYPES.has(laporanType)) {
        // Excel row number = data index + 2 (header is row 1)
        const parsed = parseReportDate(String(source['K01'] ?? ''));
        if (parsed === null) {
          return badRequest(`Baris ${i + 2}: tanggal di kolom K01 tidak dapat dibaca.`);
        }
        rowFrom = parsed;
        rowTo = parsed;
        datedTypes.add(laporanType);
        datedDates.add(parsed);
      } else {
        undatedTypes.add(laporanType);
      }

      const row: Record<string, string | null> = {
        import_date: rowFrom,
        period_from: rowFrom,
        period_to: rowTo,
        laporan_type: laporanType,
      };
      for (const k of K_COLUMNS) {
        row[k.toLowerCase()] = toText(source[k]);
      }
      rows.push(row);
    }

    if (rows.length === 0) {
      return badRequest('Tidak ada baris dengan kolom Laporan yang terisi.');
    }

    // Replace only what this file covers, so other report types and periods are left alone:
    // - dated types: their rows on the dates in the file
    // - undated types: their rows whose period overlaps the picked period
    // Note: the delete and insert are separate requests, so a failed insert leaves this data empty until re-uploaded.
    if (datedTypes.size > 0) {
      const { error: deleteError } = await supabase
        .from('soc_reports')
        .delete()
        .in('laporan_type', [...datedTypes])
        .in('import_date', [...datedDates]);
      if (deleteError) throw deleteError;
    }
    if (undatedTypes.size > 0) {
      const { error: deleteError } = await supabase
        .from('soc_reports')
        .delete()
        .in('laporan_type', [...undatedTypes])
        .lte('period_from', periodTo)
        .gte('period_to', periodFrom);
      if (deleteError) throw deleteError;
    }

    // Insert in chunks: a full export is ~17k rows, too large for one request
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      const { error: insertError } = await supabase
        .from('soc_reports')
        .insert(rows.slice(i, i + INSERT_CHUNK_SIZE));
      if (insertError) throw insertError;
    }

    return jsonResponse({
      saved: rows.length,
      period: { from: periodFrom, to: periodTo },
      import_dates: [...datedDates].sort(),
    });
  } catch (error) {
    return serverError('SOC UPLOAD', error);
  }
};
