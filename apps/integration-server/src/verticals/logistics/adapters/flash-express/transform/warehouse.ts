import type { Warehouse } from '../../../schema/warehouse'

// ─── Flash Express raw types ───────────────────────────────────────────────

/**
 * One row of `data` from getAllWarehouses, POST /open/v1/warehouses
 * (https://open-docs.flashexpress.com/#getallwarehouses-getallwarehouses-warehouses).
 * The Response Body table documents warehouseNo ("shipper's warehouse No."),
 * countryName, provinceName ("first-level administrative division"), cityName
 * ("Second-level"), districtName ("Third-level"), postalCode, detailAddress,
 * phone ("shipper's phone number") and srcName ("shipper's name"); the
 * response body example also carries `"name": "AAXXXX_001"`.
 */
export interface FlashExpressWarehouse {
  warehouseNo: string
  name?: string | null
  countryName?: string | null
  provinceName?: string | null
  cityName?: string | null
  districtName?: string | null
  postalCode?: string | null
  detailAddress?: string | null
  phone?: string | null
  srcName?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * `countryName` is a name ("Thailand" in the example), not an ISO 3166
 * alpha-2 code, so the canonical `country` is left out rather than guessed; it
 * stays on `metadata`. The docs give no active flag, time zone or cut-off.
 */
export function transformWarehouse(raw: FlashExpressWarehouse): Warehouse {
  const address = {
    name: raw.srcName ?? undefined,
    street1: raw.detailAddress ?? undefined,
    street2: raw.districtName ?? undefined,
    city: raw.cityName ?? undefined,
    state: raw.provinceName ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    phone: raw.phone ?? undefined,
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)

  return {
    id: raw.warehouseNo,
    code: raw.warehouseNo,
    name: raw.name ?? undefined,
    address: hasAddress ? address : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
