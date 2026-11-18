/**
 * A required identity field read from an EspoCRM record. EspoCRM records
 * always carry `id` (docs.espocrm.com/api/spec.json lists `id` on every
 * entity schema), so an absent one is a malformed response: it throws rather
 * than inventing an empty id.
 */
export function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`EspoCRM ${what} is missing`)
  }
  return value
}
