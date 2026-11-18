/**
 * Helpers shared by the emSigner transforms.
 *
 * Every emSigner reply is wrapped in `eMDMS.Helper.ReturnObject`
 * (https://api.emsigner.com/swagger/docs/v1): `{ IsSuccess: boolean,
 * Messages: string[], ErrorCode: integer, Response: … }`.
 */

/** A string-valued metadata map, keeping only the scalar entries that are set. */
export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** A string, or undefined when absent or empty. */
export function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A required integer id (Swagger `"format": "int32", "type": "integer"`); throws when absent. */
export function requireIntId(value: unknown, what: string): string {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  throw new Error(`emsigner ${what} is missing`)
}

/**
 * An ISO-8601 date, or a date-time that carries its own zone, normalised;
 * undefined for anything else.
 *
 * emSigner's date fields are Swagger `"type": "string"` with no format
 * (UploadTime, SignedDate, UploadDateTime, DeclinedDate), except
 * DocumentLog.DateTime, which is `"format": "date-time"`. Neither the
 * Swagger nor the Postman collection names a time zone. So a string that is
 * not ISO-8601 is NOT handed to `new Date` (which reads "04/06/2020" as
 * 6 April when an Indian platform most likely meant 4 June), and a date-time
 * with no offset is not read either: `new Date` would place it in whatever
 * zone this process runs in.
 */
export function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  )
  if (!dateOnly && !zoned) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** An email address, or undefined when the field does not hold one. */
export function emailOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && EMAIL.test(value) ? value : undefined
}
