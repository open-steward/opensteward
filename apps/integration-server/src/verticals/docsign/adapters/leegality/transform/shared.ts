import { toIsoDatetime } from '@opensteward/shared'

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

/**
 * Leegality serialises timestamps as `dd-MM-yyyy HH:mm:ss` (e.g.
 * `15-01-2026 09:30:00`) — a non-ISO field order that `toIsoDatetime`
 * cannot parse on its own. Normalise that shape to ISO first; fall back to
 * the shared coercer for anything already ISO-ish or epoch-based. Returns
 * undefined (never throws) for missing or unparseable input.
 */
export function toIso(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const m = v
      .trim()
      .match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    if (m) {
      const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = m
      // Leegality timestamps are wall-clock IST (UTC+05:30). Anchor the
      // offset so the resulting instant is correct rather than naively UTC.
      const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`
      return toIsoDatetime(iso)
    }
  }
  return toIsoDatetime(v)
}
