/** The record's currency, else the caller's documented currency. No implicit default. */
export function pickCurrency(v: string | null | undefined, fallback: string): string {
  if (!v || typeof v !== 'string') return fallback
  return v.toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

/**
 * Safely parse a number and return 0 if invalid.
 */
export function safeInt(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  const n = parseInt(String(v ?? '0'), 10)
  return isFinite(n) ? n : 0
}

/**
 * Stark Bank entities carry `tags` as a LIST OF STRINGS ("Tags associated
 * with the ..."). Canonical metadata is a string map, so a non-empty list is
 * kept as one comma-joined `tags` entry.
 */
export function tagsMetadata(tags: unknown): Record<string, string> {
  if (!Array.isArray(tags)) return {}
  const list = tags.filter((t): t is string => typeof t === 'string')
  return list.length > 0 ? { tags: list.join(',') } : {}
}

/** An integer amount field, or undefined when absent or not an integer. */
export function intOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined
}

/** A string field, or undefined when absent or empty. */
export function strOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** The documented `id` field; a record without one cannot be read back. */
export function requireId(raw: Record<string, unknown>, entity: string): string {
  const id = raw['id']
  if (typeof id !== 'string' || id === '') {
    throw new Error(`Stark Bank ${entity} has no id`)
  }
  return id
}
