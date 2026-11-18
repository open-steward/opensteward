/**
 * ForceManager returns links to other records as value-list objects, e.g.
 * `"accountId": { "id": 1241, "value": "Acme Inc." }` or `null`
 * (https://developer.forcemanager.com/openapi.json, every entity's list example).
 */
export interface ValueRef {
  id: number | string
  value?: string | null
}

/** The linked record's id as a string, or undefined for `null` / an absent link. */
export function refId(ref: ValueRef | null | undefined): string | undefined {
  return ref != null && ref.id != null && ref.id !== '' ? String(ref.id) : undefined
}

/** The record's own `id` ("Unique identifier ... in ForceManager"), required. */
export function requireId(raw: { id?: number | string | null }, entity: string): string {
  if (raw.id == null || raw.id === '') {
    throw Object.assign(new Error(`ForceManager ${entity} has no id`), { statusCode: 502 })
  }
  return String(raw.id)
}

/** A string field, or undefined when null or empty. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}
