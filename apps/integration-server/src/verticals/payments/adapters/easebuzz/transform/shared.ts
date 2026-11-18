/**
 * Helpers shared across Easebuzz transform files.
 *
 * Easebuzz settles in INR and represents money as decimal major-unit strings
 * (e.g. "125.0" rupees). The canonical schema carries integer minor units, so
 * `toMinorUnits` multiplies by 100 and rounds. Datetimes arrive as Asia/Kolkata
 * local strings (e.g. "2026-01-15 09:30:00") with no offset; `toIsoDatetime`
 * normalises them to strict ISO-8601, returning undefined on anything
 * unparseable (transforms never throw).
 */

/** "125.0" / "125.00" major-unit rupees → 12500 minor units. */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/**
 * Normalise an Easebuzz datetime to strict ISO-8601, or undefined if absent /
 * unparseable. Easebuzz emits `addedon` as IST wall-clock without an offset
 * ("2026-01-15 09:30:00"); we treat it as IST (+05:30) so the instant is
 * correct rather than silently UTC-shifted.
 */
export function toIsoDatetime(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const trimmed = v.trim()
  if (!trimmed) return undefined
  // Already offset-qualified (ISO with Z or ±hh:mm) — parse as-is.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  // Bare "YYYY-MM-DD HH:MM:SS" (or with 'T') in IST → pin +05:30.
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}+05:30`)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Coerce an arbitrary object into a string-only metadata map, dropping nullish. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}
