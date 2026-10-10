const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Human-readable byte count using binary units (1 KB = 1024 B), e.g. "12,34 TB".
 * Indonesian number formatting: comma as the decimal separator.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  const formatted = value.toLocaleString('id-ID', { maximumFractionDigits: unit === 0 ? 0 : 2 });
  return `${formatted} ${BYTE_UNITS[unit]}`;
}
