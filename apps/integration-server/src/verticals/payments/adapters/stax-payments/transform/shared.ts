export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

/** A documented string field, or undefined when it is absent, null or empty. */
export function optStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v === '' ? undefined : v
  if (typeof v === 'number') return String(v)
  return undefined
}

/**
 * A documented major-unit money field as a number. Stax sends these as JSON
 * numbers (`"total": 42`) and, inside line items, as strings (`"price": "100.00"`).
 */
export function majorNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * The id a canonical record requires. A row without it cannot be addressed,
 * so it fails loudly rather than becoming '' or 'unknown'.
 */
export function requiredId(v: unknown, what: string): string {
  const s = optStr(v)
  if (s === undefined) throw new Error(`Stax Payments ${what} has no id`)
  return s
}
