/**
 * Shared transform helpers.
 * Money values are stored as integer minor units (cents, pence, etc.).
 */

export function toIsoDatetime(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'number') {
    // Unix timestamp (seconds or milliseconds)
    const ms = value > 1e10 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
    return undefined
  }
  return undefined
}

/** Alias kept for backwards compat with stripe scaffold copies */
export const toIso = toIsoDatetime

export function fromIso(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined
  return Math.floor(new Date(iso).getTime() / 1000)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined
  if (v == null) return undefined
  return String(v) || undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isNaN(v) ? undefined : v
  if (v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

/** Convert major-unit float (e.g. 1.50) to minor units (150) */
export function toMinorUnits(amount: unknown, decimals = 2): number | undefined {
  const n = pickNum(amount)
  if (n === undefined) return undefined
  return Math.round(n * Math.pow(10, decimals))
}

/** Convert minor units (150) to major-unit float (1.50) */
export function fromMinorUnits(amount: unknown, decimals = 2): number | undefined {
  const n = pickNum(amount)
  if (n === undefined) return undefined
  return n / Math.pow(10, decimals)
}
