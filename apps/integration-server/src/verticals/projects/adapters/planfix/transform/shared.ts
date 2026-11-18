export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'object') return undefined
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
 * Planfix timestamps are returned as a `TimePoint` object
 * `{ date?, time?, datetime? }`. Prefer the full `datetime`, fall back to the
 * date-only field. Returns a strict ISO-8601 string or undefined.
 */
export interface PlanfixTimePoint {
  date?: string
  time?: string
  datetime?: string
}

export function timePointToIso(tp: PlanfixTimePoint | null | undefined): string | undefined {
  if (!tp || typeof tp !== 'object') return undefined
  return toIso(tp.datetime) ?? toIso(tp.date)
}

/**
 * Planfix references people with a string id that is namespaced by entity
 * kind, e.g. `"user:42"`, `"contact:1001"`, `"group:7"`. The canonical id is
 * the string as-is; this helper just normalises it to a string.
 */
export interface PlanfixPerson {
  id?: string | number
  name?: string
}

export function personId(p: PlanfixPerson | null | undefined): string | undefined {
  if (!p || typeof p !== 'object') return undefined
  return pickStr(p.id)
}

/**
 * Planfix groups assignees/participants as `{ users: Person[], groups: Group[] }`.
 * Flatten the `users` ids for canonical assignee resolution (groups are folded
 * into metadata by callers when relevant).
 */
export interface PlanfixPeople {
  users?: PlanfixPerson[]
  groups?: PlanfixPerson[]
}

export function peopleUserIds(people: PlanfixPeople | null | undefined): string[] {
  if (!people || typeof people !== 'object') return []
  return (people.users ?? [])
    .map((u) => personId(u))
    .filter((id): id is string => typeof id === 'string')
}
