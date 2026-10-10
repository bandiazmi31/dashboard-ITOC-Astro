import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50000;
const INSERT_CHUNK_SIZE = 1000;
const K_COLUMNS = Array.from({ length: 15 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`);
const REQUIRED_HEADERS = ['Laporan', ...K_COLUMNS];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Report types whose K01 holds the row's own date, e.g. "Wed, Oct 7, 2026".
// Every other type takes the date picked in the upload widget.
const DATED_REPORT_TYPES = new Set(['SOC-Threat-Summary', 'SOC-URL-Summary', 'SOC-AppStats-Historical']);
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const badRequest = (error: string, status = 400) => jsonResponse({ error }, status);

/** True only for a real calendar date in YYYY-MM-DD form */
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

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
      return badRequest('Permintaan harus berupa form-data dengan field "file" dan "import_date".');
    }

    const file = form.get('file');
    const pickedDate = String(form.get('import_date') ?? '').trim();

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
    if (!isValidDate(pickedDate)) {
      return badRequest('Tanggal import tidak valid (format YYYY-MM-DD).');
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
    for (let i = 0; i < rawRows.length; i++) {
      const source = rawRows[i];
      const laporanType = toText(source['Laporan']);
      if (laporanType === null) continue; // blank spreadsheet rows

      // Excel row number = data index + 2 (header is row 1)
      let importDate = pickedDate;
      if (DATED_REPORT_TYPES.has(laporanType)) {
        const parsed = parseReportDate(String(source['K01'] ?? ''));
        if (parsed === null) {
          return badRequest(`Baris ${i + 2}: tanggal di kolom K01 tidak dapat dibaca.`);
        }
        importDate = parsed;
      }

      const row: Record<string, string | null> = {
        import_date: importDate,
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

    // Idempotency across every date in the file: remove those dates, then insert the new batch.
    // Note: the delete and insert are separate requests, so a failed insert leaves these dates empty until re-uploaded.
    const importDates = [...new Set(rows.map(r => r.import_date as string))];

    const { error: deleteError } = await supabase
      .from('soc_reports')
      .delete()
      .in('import_date', importDates);
    if (deleteError) throw deleteError;

    // Insert in chunks: a full export is ~17k rows, too large for one request
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      const { error: insertError } = await supabase
        .from('soc_reports')
        .insert(rows.slice(i, i + INSERT_CHUNK_SIZE));
      if (insertError) throw insertError;
    }

    return jsonResponse({ saved: rows.length, import_dates: importDates.sort() });
  } catch (error) {
    return serverError('SOC UPLOAD', error);
  }
};
