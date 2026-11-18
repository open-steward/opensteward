/**
 * NuORDER Warehouse → canonical Location.
 *
 * Only `name` is shown verbatim as a Warehouse field in
 * https://assets.nuorder.com/api-docs/index.html; `address`/`code` are
 * mentioned in prose but never shown as a concrete JSON shape (flat fields?
 * a nested object? which keys?), so `address` is left unmapped rather than
 * guessed at — it is still fully present in `metadata`. `id` is inferred
 * from every other NuORDER resource using an `id` primary key, not shown for
 * Warehouse specifically.
 */
import type { Location } from '../../../schema/location'

export interface RawNuorderWarehouse {
  id?: string | number
  name?: string
  code?: string
  active?: boolean
}

function requireName(name: string | undefined, id: string | number): string {
  if (!name) throw new Error(`NuORDER warehouse ${id} has no name; refusing to invent one`)
  return name
}

export function transformLocation(raw: RawNuorderWarehouse): Location {
  const id = raw.id ?? raw.code
  if (id == null) {
    throw new Error('NuORDER warehouse record has neither id nor code — cannot assign a canonical id')
  }
  return {
    id: String(id),
    name: requireName(raw.name, id),
    active: raw.active,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
