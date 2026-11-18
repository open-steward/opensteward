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
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

const FAVEO_DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/**
 * A v3 timestamp such as `"created_at": "2018-03-20 05:17:24"`
 * (https://developers.faveohelpdesk.com/ticket-threads-2/) as ISO 8601.
 *
 * The docs give no offset, so the value is read as UTC explicitly — never
 * through `new Date(str)`, which would read it in the host's local zone and
 * give a different instant on every server. Anything else throws: the field
 * is required on the canonical record and there is nothing to substitute.
 */
export function faveoDateTime(value: unknown, what: string): string {
  const m = typeof value === 'string' ? FAVEO_DATETIME.exec(value) : null
  if (!m) throw new Error(`faveo-helpdesk: ${what} is not a "YYYY-MM-DD HH:MM:SS" timestamp`)
  const [, y, mo, d, h, mi, s] = m
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)).toISOString()
}
