export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/**
 * "Boolean value (true / false). The API could return also 0 (false) and 1
 * (true)" (https://erplain.readme.io/v2.0/reference/data-types).
 */
export function pickBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1) return true
  if (v === 0) return false
  return undefined
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** A documented Int id, as the canonical string id. Throws when it is absent. */
export function requireId(v: unknown, what: string): string {
  const id = pickStr(v)
  if (id === undefined) throw new Error(`erplain ${what} has no id`)
  return id
}
