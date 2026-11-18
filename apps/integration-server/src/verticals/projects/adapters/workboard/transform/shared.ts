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

/**
 * WorkBoard types its goal/metric/team timestamps as `string` without naming
 * a format (a user's `create_at` is sometimes an integer, the MIT dates are
 * "unix timestamp"s). Only a value that cannot be misread is mapped: a bare
 * `YYYY-MM-DD` date, or a date-time that carries its own zone. Anything else
 * (a zoneless date-time, epoch digits) is left out rather than guessed at.
 */
export function unambiguousIso(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v)
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)
  if (!dateOnly && !zoned) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * The goal, metric and team names are required on create (POST /goal
 * `"required":["goal_name"]`, metric_name "Required The name of your metric.",
 * POST /team `"required":["team_owner","team_name"]`), so a record read back
 * without one is malformed: it is refused rather than given an empty name.
 */
export function requiredName(v: unknown, what: string, id: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`WorkBoard ${what} ${id} has no name`)
  return v
}
