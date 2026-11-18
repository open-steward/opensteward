/**
 * Field readers shared by the Krayin CRM transforms. Each reads one
 * documented field and refuses to invent a value for it.
 */

/**
 * A required Krayin id (`@OA\Property(title="ID", format="int64")`), as a
 * string. Throws rather than returning a placeholder: an id that is not
 * there cannot be read back.
 */
export function requireId(value: unknown, what: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value !== '') return value
  throw new Error(`Krayin CRM ${what} has no id`)
}

/** A required non-empty string field; throws when it is missing. */
export function requireString(value: unknown, what: string): string {
  if (typeof value === 'string' && value !== '') return value
  throw new Error(`Krayin CRM ${what} is missing`)
}

/** An optional id nested in a related resource (`{ id }`), or undefined. */
export function optionalId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value !== '') return value
  return undefined
}

/** An optional non-empty string, or undefined. */
export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}
