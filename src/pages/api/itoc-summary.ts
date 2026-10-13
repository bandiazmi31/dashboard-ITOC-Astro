import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { createSupabaseServerClient } from '../../lib/supabase';
import { jsonResponse, serverError } from '../../lib/http';
import { parseItocWorkbook } from '../../lib/itoc-summary';
import { resolveItocSummaryPath } from '../../lib/itoc-schedule';

/**
 * GET /api/itoc-summary
 * Returns the "Summary" and "Shift ITOC" sheets from the local workbook (public/ by default, or ITOC_SUMMARY_XLSX_PATH).
 * The file is read on each request so edits to the workbook show up without a restart.
 */
export const GET: APIRoute = async ({ cookies }) => {
  // /api/* routes must check the session themselves
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolveItocSummaryPath());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return jsonResponse({ error: 'File Summary Data ITOC & EOS tidak ditemukan.' }, 404);
    }
    return serverError('ITOC SUMMARY', err);
  }

  try {
    return jsonResponse(parseItocWorkbook(buffer));
  } catch (err) {
    if (err instanceof Error && err.message.includes('tidak ditemukan')) {
      return jsonResponse({ error: err.message }, 500);
    }
    return serverError('ITOC SUMMARY', err);
  }
};
