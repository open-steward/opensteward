/**
 * Magento MSI Source → canonical Location.
 *
 * Magento 2.3+ models fulfillment origins under
 * `/V1/inventory/sources`. Each source has a stable `source_code`
 * (e.g. `default`, `warehouse_east`) which we use as the canonical
 * `Location.id`.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawMagentoSource {
  source_code: string
  name: string
  enabled?: boolean
  description?: string
  latitude?: number
  longitude?: number
  country_id?: string
  region_id?: number | null
  region?: string
  city?: string
  street?: string
  postcode?: string
  contact_name?: string
  email?: string
  phone?: string
  fax?: string
  use_default_carrier_config?: boolean
  carrier_links?: unknown[]
  extension_attributes?: Record<string, unknown>
  [key: string]: unknown
}

function mapAddress(raw: RawMagentoSource): Address | undefined {
  const line1 = raw.street
  const city = raw.city
  const region = raw.region
  const postalCode = raw.postcode
  const country = raw.country_id
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformLocation(raw: RawMagentoSource): Location {
  return {
    id: raw.source_code,
    name: raw.name,
    active: raw.enabled,
    address: mapAddress(raw),
    phone: raw.phone,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}
