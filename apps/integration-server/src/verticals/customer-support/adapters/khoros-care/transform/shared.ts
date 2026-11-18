export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** Care timestamps (`createDate`, `publishDate`) are epoch milliseconds. */
export function epochMsToIso(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return new Date(v).toISOString()
}

/** A required field the documented payload always carries; its absence is a broken response. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Khoros Care response is missing ${what}`)
  }
  return value
}
