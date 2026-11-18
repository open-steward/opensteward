/**
 * Concord dates are Unix timestamps in milliseconds
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml, e.g.
 * AgreementListItemDto.createdAt: "Creation date as Unix timestamp in
 * milliseconds", example 1456763982000).
 */
export function msToIso(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** A string-valued metadata map, keeping only the scalar entries that are set. */
export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** A required string field; throws naming the field when it is absent or empty. */
export function requireStr(value: unknown, what: string): string {
  if (typeof value === 'string' && value !== '') return value
  throw new Error(`concord ${what} is missing`)
}

/** An ISO-8601 `date-time` string, normalised; undefined when absent or unparseable. */
export function dateTimeToIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
