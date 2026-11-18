import { toIsoDatetime } from '@opensteward/shared'

/**
 * Field readers shared by the Salesmate transforms.
 *
 * The documented "Get a Contact" response carries empty strings for unset
 * text fields (`"email": ""`, `"phone": ""`), numeric ids (`"id": 40`), and
 * related records as objects (`"owner": { "id": 1, … }`,
 * `"company": { "id": 38, … }`). The search bodies name related ids the same
 * way (`deal.owner.id`, `deal.primaryContact.id`, `activity.relatedTo.id`).
 */

/** A related record as the docs show it: an object whose `id` is the key. */
export interface SalesmateRef {
  id?: number | string | null
  [key: string]: unknown
}

/** A non-empty string, or undefined for "", null and non-strings. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** A numeric or string id as a string, or undefined when absent. */
export function idOf(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim() !== '') return v
  return undefined
}

/** The `id` of a related-record object (`owner.id`, `company.id`, …). */
export function refId(v: SalesmateRef | null | undefined): string | undefined {
  return v && typeof v === 'object' ? idOf(v.id) : undefined
}

/** The record's own id. A record without one cannot be read back, so throw. */
export function requireId(v: unknown, resource: string): string {
  const id = idOf(v)
  if (id === undefined) throw new Error(`Salesmate ${resource} has no id`)
  return id
}

/**
 * An ISO-8601 timestamp, as the docs show them (`"createdAt":
 * "2020-08-21T11:51:34.000Z"`). Other shapes (the docs also show request
 * values such as "Apr 04, 2018") have no documented zone, so they are dropped
 * rather than guessed.
 */
export function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return undefined
  return toIsoDatetime(v)
}
