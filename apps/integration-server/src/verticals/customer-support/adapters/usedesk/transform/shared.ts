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

/**
 * toIso — converts a UseDesk datetime string to strict ISO-8601.
 *
 * UseDesk returns datetimes as "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"
 * with no zone designator, and documents them as "UTC+0 time zone" (e.g.
 * https://api.usedocs.com/article/51377, published_at). Both forms are read
 * as UTC, never as the host's local time. Never throws; returns undefined
 * for missing or unparseable values.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // "YYYY-MM-DD HH:MM[:SS]" (UTC+0) → "YYYY-MM-DDTHH:MM[:SS]Z"
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)
    ? str.replace(' ', 'T') + 'Z'
    : str
  const d = new Date(normalised)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
