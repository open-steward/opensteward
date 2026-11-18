import { z } from 'zod'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/**
 * An Intercom id that may arrive as a string or an integer
 * (`admin_assignee_id` and `team_assignee_id` are integers in the schema, and
 * the webhook example shows `'0'` for none). Absent, null, empty and zero
 * all mean "none".
 */
export function pickId(v: unknown): string | undefined {
  const s = pickStr(v)
  return s === undefined || s === '0' ? undefined : s
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/**
 * Intercom timestamps are Unix seconds (`created_at: 1734537460`; contact
 * fields say "(Unix timestamp in seconds)"). Anything that is not a finite
 * number ≥ 0 is absent.
 */
export function fromUnix(v: unknown): string | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return undefined
  return new Date(n * 1000).toISOString()
}

/** An ISO 8601 string (macros' `created_at`/`updated_at`), normalised; anything unparseable is absent. */
export function fromIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const Email = z.email()

/** The address, only when the canonical schema's `z.email()` accepts it. */
export function pickEmail(v: unknown): string | undefined {
  const s = pickStr(v)
  return s !== undefined && Email.safeParse(s).success ? s : undefined
}
