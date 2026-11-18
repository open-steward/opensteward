import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ─── Raw API types ────────────────────────────────────────────────────────────

interface LoopDestinationAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

export interface LoopDestination {
  id?: string | number | null
  /**
   * Type: "warehouse" or "donate"
   */
  type?: string | null
  name?: string | null
  enabled?: boolean | null
  provider_location_id?: string | number | null
  address?: LoopDestinationAddress | null
  [key: string]: unknown
}

export interface LoopDestinationsResponse {
  destinations?: LoopDestination[] | null
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDestinationAddress(
  raw: LoopDestinationAddress | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zip ?? undefined,
    country: raw.country_code ?? raw.country ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Transform a Loop Returns destination into a canonical Warehouse.
 * Loop Returns "destinations" are physical locations (warehouses or donation
 * centers) to which return shipments are directed.
 * Real endpoint: GET /destinations  (API key, "Destinations (Read)" scope)
 *                GET /destinations/{id}
 */
export function transformDestinationToWarehouse(raw: LoopDestination): Warehouse {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    isActive: raw.enabled ?? undefined,
    address: toDestinationAddress(raw.address),
    metadata: raw as Record<string, unknown>,
  }
}
