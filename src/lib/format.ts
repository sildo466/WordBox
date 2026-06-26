/**
 * Format a number to exactly 2 decimal places.
 * Whole numbers are shown without decimals for cleanliness.
 */
export function fmt2(value: unknown): string {
  if (typeof value === 'string') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    value = n
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00'
  if (Number.isInteger(value)) return value.toFixed(2)
  return value.toFixed(2)
}

/**
 * Format a percentage value (0-100 scale) to 2 decimal places with % suffix.
 */
export function fmtPct(value: unknown): string {
  return `${fmt2(value)}%`
}
