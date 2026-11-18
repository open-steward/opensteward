import type { Warehouse } from '../../../schema/warehouse'
import { toAddress } from '../../shared/transform'

// Onfleet hub: a depot location for a team, used as the origin for route
// optimisation.  Maps to the canonical Warehouse resource.
// Endpoint: GET /api/v2/hubs  (returns an array of hub objects)
// Docs: https://docs.onfleet.com/reference/hubs

export interface OnfleetHubAddress {
  number?: string | null
  street?: string | null
  city?: string | null
  county?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  name?: string | null
  apartment?: string | null
  [key: string]: unknown
}

export interface OnfleetHub {
  id: string
  name?: string | null
  address?: OnfleetHubAddress | null
  location?: number[] | null   // [longitude, latitude]
  teams?: string[] | null
  [key: string]: unknown
}

// Normalise the Onfleet address shape to the shared Address type.
// Onfleet uses "number" + "street" rather than a combined street1.
function hubToAddress(raw: OnfleetHubAddress | null | undefined) {
  if (!raw) return undefined
  const street1 = [raw.number, raw.street].filter(Boolean).join(' ') || undefined
  return toAddress({
    ...raw,
    street1: street1 ?? raw.street,
    // toAddress looks for .name, .city, .state, .postalCode, .country
  })
}

export function transformWarehouse(raw: OnfleetHub): Warehouse {
  return {
    id: raw.id,
    name: raw.name ?? undefined,
    address: hubToAddress(raw.address ?? undefined),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
