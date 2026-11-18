/**
 * Spree StockLocation → canonical Location.
 *
 * Spree models fulfillment origins as "stock locations" under
 * `/api/v2/platform/stock_locations`. Each location has a name,
 * address fields, and an active flag.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawSpreeStockLocation {
  id: number | string
  name: string
  active?: boolean
  admin_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state_name?: string | null
  state_id?: number | string | null
  country_id?: number | string | null
  country_iso?: string | null
  zipcode?: string | null
  phone?: string | null
  backorderable_default?: boolean
  propagate_all_variants?: boolean
  default?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSpreeStockLocation): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state_name ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country_iso ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawSpreeStockLocation): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: raw.active,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}
