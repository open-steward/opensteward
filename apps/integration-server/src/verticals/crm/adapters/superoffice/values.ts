/**
 * Readers for SuperOffice values, shared by the transforms.
 *
 * Archive (OData) rows carry display values, so a numeric column may arrive
 * as a number or as its digits; entity carriers carry numbers. Both read here.
 */

/** A database id: a positive integer, or its digits. Anything else is no id. */
export function positiveId(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim())
    return Number.isSafeInteger(n) && n > 0 ? String(n) : undefined
  }
  return undefined
}

/** A string value, or undefined. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** A whole number, from a number or its digits. */
export function integer(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) ? value : undefined
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim())
  return undefined
}

const ISO_DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/

/**
 * A timestamp the docs describe as UTC ("Last updated date in UTC.",
 * "The date/time the data was last updated in UTC."). One sent without an
 * offset is still UTC, so it gains a `Z`; anything that is not an ISO
 * date-time is dropped.
 */
export function utcTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = ISO_DATETIME.exec(value.trim())
  if (!m) return undefined
  return m[2] ? value.trim() : `${m[1]}Z`
}

/**
 * A timestamp the docs give no zone for (a sale date, an appointment start).
 * Served only when it carries its own offset: without one it is a wall-clock
 * time in an unknown zone, and guessing UTC would move it.
 */
export function zonedTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = ISO_DATETIME.exec(value.trim())
  return m && m[2] ? value.trim() : undefined
}

/**
 * A field of the first EntityElement in a collection (emails, phones). The
 * EntityElement carrier (openapi-v3-Person.json) documents both:
 *   Value         "The Element FullName.  This is a value that is intended to be shown to the user."
 *   StrippedValue "The Element FullName.  This is a value that can be parsed and used by systems."
 * and "When used in a list or array the rank is the ascending list order.",
 * so the first element is the top-ranked one.
 */
export function firstElementValue(
  elements: unknown,
  field: 'Value' | 'StrippedValue' = 'Value',
): string | undefined {
  if (!Array.isArray(elements) || elements.length === 0) return undefined
  const first = elements[0] as Record<string, unknown> | null
  const value = first?.[field]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * The row id of an archive row. Documented example rows
 * (https://docs.superoffice.com/en/api/web-services/howto/company/get-all-contacts-rest):
 *   { "PrimaryKey": "3", "EntityName": "contact", "name": "Amadeus AS", … }
 */
export function primaryKey(row: { PrimaryKey?: unknown }, what: string): string {
  const id = positiveId(row.PrimaryKey)
  if (id === undefined) {
    throw new Error(`SuperOffice ${what} row has no PrimaryKey: ${JSON.stringify(row.PrimaryKey)}`)
  }
  return id
}

/** A required id on an entity carrier. */
export function requireId(value: unknown, what: string): string {
  const id = positiveId(value)
  if (id === undefined) throw new Error(`SuperOffice ${what} has no id: ${JSON.stringify(value)}`)
  return id
}
