/**
 * SCAYLE Warehouse → canonical Location.
 *
 * SCAYLE calls fulfillment locations "warehouses". Each Warehouse has:
 *  - id (int), referenceKey, isZeosWarehouse,
 *    shopCountries[] (WarehouseShopCountry with shopCountryWarehouseId),
 *    merchants[]
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Location } from '../../../schema/location'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleWarehouseShopCountry {
  countryCode?: string
  shopCountryWarehouseId?: number | string
}

export interface RawScayleWarehouse {
  id: number | string
  referenceKey?: string | null
  isZeosWarehouse?: boolean
  shopCountries?: RawScayleWarehouseShopCountry[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawScayleWarehouse): Location {
  return {
    id: String(raw.id),
    name: raw.referenceKey ?? String(raw.id),
    active: true,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
