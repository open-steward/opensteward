/**
 * Kaufland Marketplace Warehouse → canonical Location.
 *
 * Kaufland's equivalent of a "location" is a warehouse, accessible via
 * the /warehouses endpoint. Each warehouse has an id, name, and address.
 * Warehouses represent seller-managed fulfillment origins and are used as
 * the location reference for inventory units.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-inventory
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandWarehouseAddress {
  street?: string | null
  house_number?: string | null
  postcode?: string | null
  city?: string | null
  country?: string | null
}

export interface RawKauflandWarehouse {
  id_warehouse: number | string
  name?: string | null
  address?: RawKauflandWarehouseAddress | null
  is_active?: boolean | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawKauflandWarehouseAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const houseNum = raw.house_number ?? undefined
  const line1 = street && houseNum ? `${street} ${houseNum}` : (street ?? houseNum ?? undefined)
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, postalCode, country }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformLocation(raw: RawKauflandWarehouse): Location {
  return {
    id: String(raw.id_warehouse),
    name: raw.name ?? `Warehouse ${raw.id_warehouse}`,
    active: raw.is_active ?? undefined,
    address: mapAddress(raw.address),
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Return a synthetic default location for situations where no warehouse data
 * is available (e.g. the storefront-level default).
 */
export function syntheticDefaultLocation(storefront: string): Location {
  return {
    id: 'default',
    name: `Kaufland ${storefront.toUpperCase()} Default`,
    active: true,
    isFulfillmentCenter: true,
    metadata: { storefront },
  }
}
