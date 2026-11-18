/**
 * Vendure StockLocation -> canonical Location.
 *
 * Vendure uses StockLocations for inventory management. These map to
 * canonical Locations. Vendure StockLocations have a name and description
 * but no address by default (custom fields may add address data).
 */

import type { Location } from '../../../schema/location'

export interface RawVendureStockLocation {
  id: string
  name: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
  customFields?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformLocation(raw: RawVendureStockLocation): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: true,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformLocation(location: Partial<Location>): Record<string, unknown> {
  return {
    name: location.name,
    description: '',
  }
}
