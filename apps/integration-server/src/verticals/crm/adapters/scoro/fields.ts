import { Email, IsoDatetime } from '@opensteward/shared'

/**
 * Field readers shared by the Scoro transforms.
 *
 * https://api.scoro.com/api/v2, "Representation Formats": "Date and time
 * values are of the form YYYY-MM-DDTHH:MM:SS+0000. When not providing timezone
 * info in the value then site default timezone is used." A value without an
 * offset is in a site timezone the API never states, so it is dropped rather
 * than read as UTC.
 */
export function isoWithOffset(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // The documented "+0000" form carries an offset but no colon, which the
  // canonical IsoDatetime rejects; "+HHMM" is rewritten as the same "+HH:MM".
  const iso = value.replace(/([+-])(\d{2})(\d{2})$/, (_m, sign: string, hh: string, mm: string) =>
    /T\d{2}:\d{2}/.test(value) ? `${sign}${hh}:${mm}` : _m,
  )
  return IsoDatetime.safeParse(iso).success ? iso : undefined
}

/** A Scoro integer id ("Integer" in every id row of the reference). */
export function idOf(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '') return value
  return undefined
}

/** A required id: a record without one is an upstream fault, never ''. */
export function requiredId(value: unknown, what: string): string {
  const id = idOf(value)
  if (id === undefined) {
    throw Object.assign(new Error(`Scoro ${what} has no id`), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  }
  return id
}

export function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * Contacts, means_of_contact: "Object containing any of the following fields:
 * mobile, phone, email, website, skype, fax. Values can be strings or arrays if
 * contact has multiple means of contact. Values will always be returned as
 * arrays." The first string of the named array.
 */
export function firstMeans(means: unknown, key: 'mobile' | 'phone' | 'email'): string | undefined {
  if (means === null || typeof means !== 'object') return undefined
  const values = (means as Record<string, unknown>)[key]
  if (!Array.isArray(values)) return undefined
  const first = values.find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return first
}

/** An email the canonical `Email` accepts, else nothing (missing, not wrong). */
export function validEmail(value: string | undefined): string | undefined {
  return value !== undefined && Email.safeParse(value).success ? value : undefined
}
