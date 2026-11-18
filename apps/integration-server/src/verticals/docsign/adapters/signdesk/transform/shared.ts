import { toIsoDatetime } from '@opensteward/shared'

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
 * SignDesk timestamps arrive in several shapes depending on the field:
 * ISO-8601 (`2026-01-15T09:30:00Z`), a space-separated `YYYY-MM-DD HH:mm:ss`
 * (IST wall-clock), or millisecond epoch. Normalise the space-separated IST
 * form to an offset-anchored ISO string first, then defer to the shared
 * coercer for everything else. Returns undefined (never throws) for missing
 * or unparseable input.
 */
export function toIso(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const m = v
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
    if (m && !/[zZ+]|[+-]\d{2}:\d{2}$/.test(v.trim())) {
      const [, yyyy, mm, dd, hh, min, ss = '00'] = m
      // SignDesk dashboards render wall-clock IST (UTC+05:30); anchor the
      // offset so the resulting instant is correct rather than naively UTC.
      return toIsoDatetime(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`)
    }
  }
  return toIsoDatetime(v)
}
