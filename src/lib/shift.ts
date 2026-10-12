/**
 * Shift rules for the ITOC team roster. Shared by the server (Layout badge) and the browser
 * (Summary & Jadwal page, badge refresh), so both always agree on who is on duty.
 * No Node or Excel imports here: this file is bundled into the client.
 */

export const SHIFT_NAME: Record<string, string> = { P: 'Pagi', S: 'Sore', M: 'Malam' };

/** Schedule grid: one code per date for each team, as produced by the Shift ITOC sheet */
export interface DutyJadwal {
  dates: string[];
  teams: { team: string; codes: string[] }[];
}

export interface JakartaNow {
  /** Jakarta calendar date, YYYY-MM-DD */
  iso: string;
  hour: number;
}

export type DutyStatus = 'on-duty' | 'no-team' | 'no-schedule';

export interface Duty {
  status: DutyStatus;
  /** Shift code P, S or M for the current time */
  code: string;
  /** Team on duty when status is 'on-duty' */
  team: string | null;
}

/** Current date and hour in Jakarta (WIB), whatever time zone the code runs in */
export function jakartaNow(instant: Date = new Date()): JakartaNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Pagi 08:00-15:00, Sore 15:00-22:00, Malam 22:00-08:00 */
export function shiftAt(hour: number): string {
  return hour >= 8 && hour < 15 ? 'P' : hour >= 15 && hour < 22 ? 'S' : 'M';
}

/** The calendar date before the given YYYY-MM-DD. UTC arithmetic, so no time zone shift. */
export function previousIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Team on duty right now. Malam runs 22:00-08:00, so 00:00-08:00 belongs to the previous day's schedule.
 */
export function resolveDuty(jadwal: DutyJadwal, now: JakartaNow = jakartaNow()): Duty {
  const code = shiftAt(now.hour);
  const dayIso = code === 'M' && now.hour < 8 ? previousIso(now.iso) : now.iso;
  const idx = jadwal.dates.indexOf(dayIso);
  if (idx === -1) return { status: 'no-schedule', code, team: null };

  const team = jadwal.teams.find(t => t.codes[idx] === code);
  return team
    ? { status: 'on-duty', code, team: team.team }
    : { status: 'no-team', code, team: null };
}

/** Short badge text, e.g. "On Duty: Team 1 (Sore)" */
export function formatDutyText(duty: Duty): string {
  if (duty.status === 'on-duty' && duty.team) {
    return `On Duty: ${duty.team} (${SHIFT_NAME[duty.code] ?? duty.code})`;
  }
  if (duty.status === 'no-team') return 'On Duty: tidak ada tim';
  return 'On Duty: jadwal belum tersedia';
}
