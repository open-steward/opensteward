/**
 * Helpers shared across Swisscom Trust Services (AIS) transform files.
 *
 * AIS wraps everything in a DSS `SignResponse` object keyed by `@RequestID`
 * and `OptionalOutputs.async.ResponseID`. There are no list endpoints — a
 * transaction is the unit of work — so these helpers normalise the single
 * SignResponse shape, coerce nulls, and parse the DSS result URNs.
 */

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
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

export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * The AIS Claimed Identity is `<customerName>:<keyEntity>`. Split it into the
 * customer prefix + key-entity suffix for metadata. Returns undefined parts
 * when the value is missing or unsplittable (transforms never throw).
 */
export function splitClaimedIdentity(value: unknown): {
  customerName?: string
  keyEntity?: string
} {
  const str = pickStr(value)
  if (!str) return {}
  const idx = str.indexOf(':')
  if (idx < 0) return { customerName: str }
  return { customerName: str.slice(0, idx), keyEntity: str.slice(idx + 1) }
}
