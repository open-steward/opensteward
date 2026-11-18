/**
 * MineralTree money unit helpers.
 *
 * Canonical amounts in OpenSteward are INTEGER MINOR UNITS (e.g. 12500 = $125.00).
 * MineralTree's REST API uses decimal major units (e.g. 125.00 = $125.00).
 *
 * toMinorUnits — API response → canonical storage  (multiply × 100, round)
 * toMajorUnits — canonical storage → API write     (divide ÷ 100)
 *
 * Both functions guard against undefined/null/NaN inputs and never throw.
 */

/**
 * Convert a MineralTree decimal amount (major units, e.g. 125.50) to
 * canonical integer minor units (e.g. 12550).  Returns `undefined` when
 * the input is absent, non-numeric, or NaN.
 */
export function toMinorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

/**
 * Convert canonical integer minor units (e.g. 12550) to a MineralTree
 * decimal amount (major units, e.g. 125.50) for API write operations.
 * Returns `undefined` when the input is absent or NaN.
 */
export function toMajorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return isNaN(n) ? undefined : n / 100
}
