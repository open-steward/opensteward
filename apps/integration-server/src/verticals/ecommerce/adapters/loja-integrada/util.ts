/**
 * Small readers shared by the Loja Integrada transforms.
 */

/** A string with something in it, else `undefined`. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/**
 * An ISO 8601 timestamp, only when the value names its own zone.
 *
 * The REST answers in the specification carry naive local times
 * (`"data_criacao": "2022-10-31T12:17:51.633657"` on GET /v1/pedido/search,
 * `"2022-10-17 13:21:05.176725"` on GET /v1/cliente), and the specification
 * never says which zone they are in. Reading them as UTC would shift every
 * timestamp by the store's offset, so a naive value is dropped (it stays in
 * `metadata`). A value that carries `Z` or `±HH:MM` is unambiguous and kept.
 */
export function zonedIso(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return undefined
  const d = new Date(s.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * The id at the end of a documented resource URI, e.g. `"/api/v1/cliente/34220641"`
 * → `"34220641"`. `undefined` when the value is not such a URI.
 */
export function idFromUri(uri: unknown, resource: string): string | undefined {
  if (typeof uri !== 'string') return undefined
  const m = new RegExp(`/api/v1/${resource}/(\\d+)(?:\\?.*)?$`).exec(uri)
  return m ? m[1] : undefined
}

/** A documented integer id, as a string. Throws when it is missing. */
export function requireId(v: unknown, what: string): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim() !== '') return v
  throw new Error(`Loja Integrada ${what} has no id`)
}
