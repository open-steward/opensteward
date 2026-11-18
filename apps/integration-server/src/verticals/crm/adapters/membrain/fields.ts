/**
 * Readers for Membrain's documented field conventions, shared by the
 * transforms. Source: https://www.membrain.com/developers/api-documentation.
 *
 * - Every value in the example results is a string ("Completed": "true",
 *   "count": "1").
 * - An unset reference is the all-zero GUID next to an empty name
 *   (`ParentCompanyId: "00000000-0000-0000-0000-000000000000"`,
 *   `ParentCompanyName: ""`; `LostReasonId` likewise), so it reads as absent.
 * - Dates are "YYYY-MM-DD HH:mm:ss.ffffff". Activity write dates are documented as
 *   UTC ("Deadline for an Activity in UTC (Only for Tasks)"), and a date the
 *   docs mark "NOT USED" for a type carries "1753-01-01 00:00:00.000000"
 *   (FromDate on a Task), which reads as absent.
 */
export const NIL_GUID = '00000000-0000-0000-0000-000000000000'

/** A non-empty string, else undefined. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** A GUID reference, with the all-zero GUID read as no reference. */
export function guid(v: unknown): string | undefined {
  const s = text(v)
  return s !== undefined && s !== NIL_GUID ? s : undefined
}

/** A documented "true"/"false" string. */
export function flag(v: unknown): boolean | undefined {
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}

const DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2})(\.\d{1,9})?)?$/
const UNUSED_DATE_PREFIX = '1753-01-01'

/** A UTC "YYYY-MM-DD HH:mm[:ss[.ffffff]]" as ISO 8601; the 1753 placeholder is absent. */
export function utcDate(v: unknown): string | undefined {
  const s = text(v)
  if (s === undefined || s.startsWith(UNUSED_DATE_PREFIX)) return undefined
  const m = DATE.exec(s)
  if (!m) return undefined
  return `${m[1]}T${m[2]}:${m[3] ?? '00'}${m[4] ?? ''}Z`
}

/** A required string field; a record without it is not a record this adapter can map. */
export function required(v: unknown, field: string, resource: string): string {
  const s = text(v)
  if (s === undefined) throw new Error(`Membrain ${resource}: response has no ${field}`)
  return s
}

/** An entry of an activity's documented `Relateds` list. */
export interface MembrainRelated {
  Id?: string
  RelatedId?: string
  RelatedClassName?: string
  RelatedName?: string
}

/** The first related item of a documented class ("Company", "Opportunity"). */
export function related(list: unknown, className: string): string | undefined {
  if (!Array.isArray(list)) return undefined
  for (const r of list as MembrainRelated[]) {
    if (r?.RelatedClassName === className) {
      const id = guid(r.RelatedId)
      if (id !== undefined) return id
    }
  }
  return undefined
}
