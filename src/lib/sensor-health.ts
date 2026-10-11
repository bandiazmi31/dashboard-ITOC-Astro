/**
 * Sensor health status logic for the honeycomb view.
 *
 * Thresholds are initial defaults from the PRD, not SLA values. They are kept
 * here so they can be changed in one place. Per-ISP SLA targets in
 * analytics.ts are separate and are not used for sensor cells.
 */
export const AVAILABILITY_THRESHOLDS = {
  /** Availability at or above this value is Normal */
  normal: 99.9,
  /** Availability at or above this value (and below `normal`) needs attention; below it is Critical */
  attention: 98,
} as const;

export type HealthStatus = 'normal' | 'attention' | 'critical' | 'no-data';

/**
 * Tailwind classes per status. The hexagon takes only the background color, since it is clipped.
 * The label on top is text-only: amber is light enough that white text would not meet contrast.
 */
export const HEALTH_STATUS_META: Record<HealthStatus, { label: string; colorClass: string; textClass: string }> = {
  normal: { label: 'Normal', colorClass: 'bg-green-700', textClass: 'text-white' },
  attention: { label: 'Perlu perhatian', colorClass: 'bg-amber-500', textClass: 'text-gray-900' },
  critical: { label: 'Kritis', colorClass: 'bg-red-600', textClass: 'text-white' },
  'no-data': { label: 'Data tidak tersedia', colorClass: 'bg-gray-500', textClass: 'text-white' },
};

export const HEALTH_STATUS_ORDER: HealthStatus[] = ['normal', 'attention', 'critical', 'no-data'];

/**
 * Parses an availability value from the API or a dataset.
 * Accepts numbers (99.59) and strings ("99.59%", "99,59 %", "99.59"). When both
 * separators appear, the last one is the decimal point ("1.234,5" -> 1234.5).
 * Returns null for empty, non-numeric, or out-of-range (outside 0-100) values.
 */
export function parseAvailability(raw: unknown): number | null {
  let value: number;

  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    let s = raw.trim().replace(/%/g, '').replace(/\s/g, '');
    if (s === '') return null;

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      // Whichever separator comes last is the decimal point; the other is a thousands separator
      s = lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (lastComma !== -1) {
      s = s.replace(',', '.');
    }

    value = Number(s);
  } else {
    return null;
  }

  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function classifyAvailability(availability: number | null): HealthStatus {
  if (availability === null) return 'no-data';
  if (availability >= AVAILABILITY_THRESHOLDS.normal) return 'normal';
  if (availability >= AVAILABILITY_THRESHOLDS.attention) return 'attention';
  return 'critical';
}

/** Formats a percentage for display with Indonesian decimal comma, e.g. 99,59%. */
export function formatAvailability(availability: number | null): string {
  if (availability === null) return 'Data tidak tersedia';
  const formatted = availability.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return `${formatted}%`;
}

/** Counts sensors per status. Only the statuses passed in are counted from the actual data. */
export function countByStatus(statuses: HealthStatus[]): Record<HealthStatus, number> {
  const counts: Record<HealthStatus, number> = { normal: 0, attention: 0, critical: 0, 'no-data': 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}
