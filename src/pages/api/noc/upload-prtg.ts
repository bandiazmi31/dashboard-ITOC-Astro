import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { createSupabaseServerClient } from '../../../lib/supabase';
import { jsonResponse, serverError } from '../../../lib/http';
import { jakartaDate } from '../../../lib/dates';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

// Excel column header (as in the NOC PRTG export) -> prtg_sensor_reports column
const COLUMN_MAP: Record<string, string> = {
  'Part': 'part',
  'Halaman': 'halaman',
  'Sensor ID': 'sensor_id',
  'Sensor': 'sensor_name',
  'Device': 'device',
  'Up (detik)': 'up_detik',
  'Down (detik)': 'down_detik',
  'Request Good': 'request_good',
  'Request Failed': 'request_failed',
  'Avg Total (Mbit/s)': 'avg_total_mbit',
  'Avg In (Mbit/s)': 'avg_in_mbit',
  'Avg Out (Mbit/s)': 'avg_out_mbit',
  'Volume Total (MB)': 'volume_total_mb',
  'Volume In (MB)': 'volume_in_mb',
  'Volume Out (MB)': 'volume_out_mb',
  'Max (Mbit/s)': 'max_mbit',
  'Min (Mbit/s)': 'min_mbit',
  'Cek': 'status_cek',
};

const TEXT_COLUMNS = new Set(['sensor_name', 'device', 'status_cek']);
const REQUIRED_HEADERS = ['Sensor ID', 'Sensor', 'Device', 'Up (detik)', 'Down (detik)', 'Avg Total (Mbit/s)'];

const badRequest = (error: string, status = 400) => jsonResponse({ error }, status);

/** Excel cell -> number or null. Accepts real numbers and numeric text such as "12,5". */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseServerClient(cookies);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return badRequest('Unauthorized: Harap login terlebih dahulu.', 401);
    }

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get('file');
    } catch {
      return badRequest('Permintaan harus berupa form-data dengan field "file".');
    }

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

    let sheet: XLSX.WorkSheet | undefined;
    let rawRows: Record<string, unknown>[];
    try {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null }) : [];
    } catch (err) {
      console.error('[PRTG UPLOAD] Excel parse failed:', err);
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

    // Excel row number = data index + 2 (header is row 1)
    const today = jakartaDate();
    const bySensor = new Map<number, Record<string, unknown>>();

    for (let i = 0; i < rawRows.length; i++) {
      const source = rawRows[i];
      const sensorId = toNumber(source['Sensor ID']);
      if (sensorId === null) {
        return badRequest(`Baris ${i + 2}: Sensor ID tidak valid.`);
      }

      const row: Record<string, unknown> = { sensor_id: sensorId, import_date: today };
      for (const [header, column] of Object.entries(COLUMN_MAP)) {
        if (column === 'sensor_id') continue;
        row[column] = TEXT_COLUMNS.has(column)
          ? (source[header] === null || source[header] === undefined ? null : String(source[header]))
          : toNumber(source[header]);
      }

      // Keep the last occurrence of each sensor within this file: one upsert row per key
      bySensor.set(sensorId, row);
    }

    const rows = [...bySensor.values()];

    // Upsert on (sensor_id, import_date): re-uploading the same day replaces its rows
    // instead of adding duplicates, so traffic and up/down totals are not double-counted.
    const { error: dbError } = await supabase
      .from('prtg_sensor_reports')
      .upsert(rows, { onConflict: 'sensor_id,import_date' });

    if (dbError) throw dbError;

    return jsonResponse({ saved: rows.length, import_date: today });
  } catch (error) {
    return serverError('PRTG UPLOAD', error);
  }
};
