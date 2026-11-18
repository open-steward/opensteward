/**
 * PlentyONE Warehouse → canonical Location.
 *
 * PlentyONE warehouses are the equivalent of Shopify locations. Each
 * warehouse has a name, type (1 = standard, 2 = repair, etc.), and an
 * optional address.
 *
 * Endpoints used:
 *   GET /rest/stockmanagement/warehouses
 *   GET /rest/stockmanagement/warehouses/{warehouseId}
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneWarehouseAddress {
  address1?: string | null
  address2?: string | null
  postalCode?: string | null
  town?: string | null
  countryId?: number
  countryIsoCode2?: string | null
  [key: string]: unknown
}

export interface RawPlentyOneWarehouse {
  id: number | string
  name: string
  /** 1 = own warehouse, 2 = repair warehouse, 3 = distribution warehouse, etc. */
  typeId?: number
  isActive?: boolean
  warehouseAddress?: RawPlentyOneWarehouseAddress | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawPlentyOneWarehouseAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.town ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryIsoCode2 ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    postalCode,
    country,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformWarehouse(raw: RawPlentyOneWarehouse): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: raw.isActive !== false,
    address: mapAddress(raw.warehouseAddress),
    // typeId 1 = own/distribution warehouse → fulfillment center
    isFulfillmentCenter: raw.typeId === 1 || raw.typeId === 3 ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
