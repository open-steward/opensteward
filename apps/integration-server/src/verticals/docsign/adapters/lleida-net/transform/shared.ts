/**
 * Helpers shared across Lleida.net Click & Sign transform files.
 *
 * Click & Sign returns dates as UNIX timestamps in seconds (sometimes as
 * stringified ints), so `toIso` coerces epoch-seconds → strict ISO-8601.
 * Transforms NEVER throw: every helper returns undefined for missing /
 * unparseable input.
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

/**
 * Coerce a Click & Sign UNIX-seconds timestamp (number or stringified int)
 * into strict ISO-8601. Returns undefined for missing / non-numeric input.
 */
export function toIso(s: unknown): string | undefined {
  const n = pickNum(s)
  if (n === undefined || n <= 0) return undefined
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** Join Click & Sign's split name parts (name + surname) into one display name. */
export function joinName(name: unknown, surname: unknown): string {
  return [pickStr(name), pickStr(surname)].filter(Boolean).join(' ').trim()
}
