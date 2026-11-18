/**
 * Maps Optimizely Configured Commerce's `WarehouseDto` (Storefront API v1,
 * `GET /api/v1/warehouses` / `/api/v1/warehouses/{id}`) to the canonical
 * Location shape. Field names per the published reference:
 * https://docs.developers.optimizely.com/configured-commerce/reference/warehousesv1_getcollectionasync
 *
 * `countryId` is a UUID (a foreign key into a Country entity), not an ISO
 * 3166-1 alpha-2 code, so it is intentionally NOT mapped onto
 * `address.country` (which requires a real alpha-2 code) — it stays
 * available in `metadata` for callers that need it.
 */
import type { Location } from '../../../schema/location'

export interface RawOptimizelyWarehouse {
  id: string
  name?: string | null
  description?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryId?: string | null
  phone?: string | null
  deactivateOn?: string | null
  allowPickup?: boolean | null
  [key: string]: unknown
}

export function transformLocation(raw: RawOptimizelyWarehouse): Location {
  return {
    id: raw.id,
    name: raw.name?.trim() || raw.id,
    active: raw.deactivateOn ? false : undefined,
    address: {
      line1: raw.address1 ?? undefined,
      line2: raw.address2 ?? undefined,
      city: raw.city ?? undefined,
      region: raw.state ?? undefined,
      postalCode: raw.postalCode ?? undefined,
    },
    phone: raw.phone ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
