/**
 * Field shapes shared by Teamwork CRM entity models, from the vendor's
 * archived API reference and "Resource objects / entity models"
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/general/entity-models):
 *
 * - "`id`: the unique identifier (integer)"
 * - "A to-one relationship property's value is a resource identifier object
 *   which contains an `id` and `type`."
 * - "When a property is empty, it will always be returned by the API. It will
 *   either be `null`, `[]`, `{}`, depending on its type."
 * - "All dates and times follow RFC-3339."
 * - to-many relationships: "All of the items might not be returned ... there's
 *   a corresponding `_Count` property (e.g. `stagesCount`) containing the
 *   total number of items in the relationship."
 */

export interface TeamworkRef {
  id: number
  type?: string
}

/** `emailAddresses[]` item: `{ address, isMain }`; "One element in the array must have this set to true." */
export interface TeamworkEmailAddress {
  address?: string | null
  isMain?: boolean | null
}

/** `phoneNumbers[]` item: `number` is "The phone number, excluding the country code (this can be specified with `code`)." */
export interface TeamworkPhoneNumber {
  number?: string | null
  isMain?: boolean | null
  code?: TeamworkRef | null
}

export function entityId(raw: { id?: unknown }, entity: string): string {
  if (typeof raw.id !== 'number' || !Number.isFinite(raw.id)) {
    throw Object.assign(new Error(`Teamwork CRM ${entity} has no integer id`), { statusCode: 502 })
  }
  return String(raw.id)
}

export function requiredString(value: unknown, field: string, entity: string): string {
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`Teamwork CRM ${entity} has no ${field}`), { statusCode: 502 })
  }
  return value
}

export function refId(ref: TeamworkRef | null | undefined): string | undefined {
  return ref && typeof ref.id === 'number' ? String(ref.id) : undefined
}

export function str(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** The array element flagged `isMain`. */
export function main<T extends { isMain?: boolean | null }>(
  items: T[] | null | undefined,
): T | undefined {
  return (items ?? []).find((i) => i.isMain === true)
}

/** The ids of a to-many relationship, only when every item came back (`items.length === count`). */
export function completeRefIds(
  items: TeamworkRef[] | null | undefined,
  count: number | null | undefined,
): string[] | undefined {
  if (!Array.isArray(items) || typeof count !== 'number' || items.length !== count) return undefined
  return items.map((i) => String(i.id))
}

export interface TeamworkAddressFields {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  stateOrCounty?: string | null
  zipcode?: string | null
}

/** Postal address from the documented flat fields; `country` is a relationship id, not a code, so it is not mapped. */
export function address(raw: TeamworkAddressFields) {
  const out = {
    line1: str(raw.addressLine1),
    line2: str(raw.addressLine2),
    city: str(raw.city),
    region: str(raw.stateOrCounty),
    postalCode: str(raw.zipcode),
  }
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}
