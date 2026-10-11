import * as XLSX from 'xlsx';

/**
 * Parser for "Summary Data ITOC & EOS.xlsx". Reads two sheets only:
 *  - "Summary": team roles with PIC, and the per-location PIC list
 *  - "Shift ITOC": the shift roster grid (teams x dates)
 *
 * Credential columns are never read. In the Summary sheet, column E holds labels such as
 * "Username" and "Password" and column G holds their values, so both columns are dropped
 * together with the URLs that sit beside them.
 */

export const SUMMARY_SHEET = 'Summary';
export const SHIFT_SHEET = 'Shift ITOC';

export interface ItocTeamRow {
  no: string;
  deskripsi: string;
  unit: string;
  pic: string;
}

export interface ItocLocationRow {
  no: string;
  lokasi: string;
  pic: string;
}

export interface ItocRosterMember {
  role: string;
  name: string;
  phone: string;
}

export interface ItocRosterTeam {
  team: string;
  members: ItocRosterMember[];
}

export interface ItocShiftTeam {
  team: string;
  /** Shift codes aligned with `ItocShiftPayload.dates`, e.g. P, S, M, O */
  codes: string[];
}

export interface ItocShiftPayload {
  /** ISO dates (YYYY-MM-DD), one per roster column */
  dates: string[];
  teams: ItocShiftTeam[];
  legend: { code: string; label: string }[];
}

export interface ItocSummaryPayload {
  summary: {
    tim: ItocTeamRow[];
    /** Team rosters built from `tim`: each "Team N" row and the analyst rows below it */
    roster: ItocRosterTeam[];
    lokasi: ItocLocationRow[];
  };
  jadwal: ItocShiftPayload;
}

type Cell = unknown;

/** Excel text as trimmed plain text. Removes the bidi marks Excel adds around phone numbers. */
function clean(value: Cell): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[‎‏‪-‮]/g, '').trim();
}

function isBlankRow(row: Cell[]): boolean {
  return row.every(c => clean(c) === '');
}

/** The Date objects from SheetJS are UTC instants; WIB dates are read with UTC getters to avoid a day shift */
function isoDate(value: Cell): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Ahmad Subandi (0853...)" -> { name: "Ahmad Subandi", phone: "0853..." } */
function splitPic(pic: string): { name: string; phone: string } {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(pic);
  if (!match) return { name: pic.trim(), phone: '' };
  return { name: match[1].trim(), phone: match[2].replace(/\s+/g, '') };
}

/**
 * Groups the team rows into rosters. A row whose Deskripsi is "Team N" starts a team; the rows
 * after it with an empty Deskripsi belong to that team. Any other labelled row ends the team.
 */
export function buildRoster(tim: ItocTeamRow[]): ItocRosterTeam[] {
  const rosters: ItocRosterTeam[] = [];
  let current: ItocRosterTeam | null = null;

  for (const row of tim) {
    const label = row.deskripsi;
    if (/^team\s*\d+/i.test(label)) {
      // The "Team N" row is the shift coordinator, so it is the first member
      current = { team: label, members: [{ role: row.unit, ...splitPic(row.pic) }] };
      rosters.push(current);
    } else if (label === '') {
      if (current) current.members.push({ role: row.unit, ...splitPic(row.pic) });
    } else {
      current = null;
    }
  }

  return rosters;
}

export function parseSummarySheet(rows: Cell[][]): ItocSummaryPayload['summary'] {
  const teamHeader = rows.findIndex(r => clean(r[0]) === 'No' && clean(r[1]) === 'Deskripsi');
  const locationHeader = rows.findIndex(r => clean(r[0]) === 'No' && clean(r[1]) === 'Lokasi');

  const tim: ItocTeamRow[] = [];
  if (teamHeader !== -1) {
    const end = locationHeader > teamHeader ? locationHeader : rows.length;
    for (let i = teamHeader + 1; i < end; i++) {
      const r = rows[i] ?? [];
      if (isBlankRow(r)) continue;
      tim.push({ no: clean(r[0]), deskripsi: clean(r[1]), unit: clean(r[2]), pic: clean(r[3]) });
    }
  }

  const lokasi: ItocLocationRow[] = [];
  if (locationHeader !== -1) {
    for (let i = locationHeader + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      // Only rows with a location name; the PIC is column D
      if (clean(r[1]) === '') continue;
      lokasi.push({ no: clean(r[0]), lokasi: clean(r[1]), pic: clean(r[3]) });
    }
  }

  return { tim, roster: buildRoster(tim), lokasi };
}

export function parseShiftSheet(rows: Cell[][]): ItocShiftPayload {
  // The date row is the first row with several real dates in it
  const dateRowIndex = rows.findIndex(r => r.filter(c => c instanceof Date).length >= 3);
  if (dateRowIndex === -1) {
    return { dates: [], teams: [], legend: [] };
  }

  const dateRow = rows[dateRowIndex];
  const columns: { col: number; date: string }[] = [];
  dateRow.forEach((c, col) => {
    const date = isoDate(c);
    if (date) columns.push({ col, date });
  });

  const teams: ItocShiftTeam[] = [];
  let legendIndex = -1;
  for (let i = dateRowIndex + 1; i < rows.length; i++) {
    const label = clean(rows[i]?.[0]);
    if (label.toLowerCase() === 'legends') {
      legendIndex = i;
      break;
    }
    if (/^team\s*\d+/i.test(label)) {
      const r = rows[i];
      teams.push({ team: label, codes: columns.map(({ col }) => clean(r[col])) });
    }
  }

  const legend: ItocShiftPayload['legend'] = [];
  if (legendIndex !== -1) {
    for (let i = legendIndex + 1; i < rows.length; i++) {
      const text = clean(rows[i]?.[0]);
      if (text === '') continue;
      const match = /^([A-Za-z])\s*=\s*(.+)$/.exec(text);
      if (match) legend.push({ code: match[1].toUpperCase(), label: match[2].trim() });
    }
  }

  return { dates: columns.map(c => c.date), teams, legend };
}

/**
 * Rows of a sheet read straight from its cells. sheet_to_json shifts Date values by the server's
 * time zone, which moves dates by a day outside WIB; the cell values are the correct UTC instants.
 */
function sheetRows(ws: XLSX.WorkSheet): Cell[][] {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows: Cell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? cell.v : '');
    }
    rows.push(row);
  }
  return rows;
}

/** Parses the workbook buffer. Throws when a required sheet is missing. */
export function parseItocWorkbook(buffer: Buffer): ItocSummaryPayload {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, sheets: [SUMMARY_SHEET, SHIFT_SHEET] });

  const summarySheet = wb.Sheets[SUMMARY_SHEET];
  const shiftSheet = wb.Sheets[SHIFT_SHEET];
  if (!summarySheet) throw new Error(`Sheet "${SUMMARY_SHEET}" tidak ditemukan`);
  if (!shiftSheet) throw new Error(`Sheet "${SHIFT_SHEET}" tidak ditemukan`);

  return {
    summary: parseSummarySheet(sheetRows(summarySheet)),
    jadwal: parseShiftSheet(sheetRows(shiftSheet)),
  };
}
