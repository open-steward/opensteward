/**
 * Helpers shared across FastSpring transform files.
 *
 * Money: FastSpring quotes amounts in MAJOR units (e.g. `total: 60.0`,
 * `price: 100`), not minor units. The canonical schema is integer minor
 * units, so every monetary amount must be scaled by 100.
 *
 * Timestamps: FastSpring emits epoch-millisecond integers (e.g.
 * `changed: 1751898991060`). `toIsoDatetime` normalises those to strict
 * ISO-8601 (it treats values > 9_999_999_999 as millis).
 *
 * Currency defaults to USD, the platform's reporting currency.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Major-unit amount → integer minor units. Returns 0 for non-finite input. */
export function toMinorUnits(major: number | string | null | undefined): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/**
 * Flatten an arbitrary value into a string→string map for `metadata`. Skips
 * null/undefined and nested objects (only scalar leaves survive).
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** Join a FastSpring contact's first + last name into a display name. */
export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | undefined {
  const name = [first, last].filter(Boolean).join(' ').trim()
  return name || undefined
}
