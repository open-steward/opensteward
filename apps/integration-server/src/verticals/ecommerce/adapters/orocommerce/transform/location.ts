/**
 * OroCommerce Warehouse → canonical Location.
 *
 * OroCommerce warehouses live at `/api/warehouses`. Each warehouse
 * has an address and active status.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawOroWarehouse {
  id: string
  name?: string
  label?: string
  enabled?: boolean
  street?: string
  street2?: string
  city?: string
  region?: string
  regionText?: string
  postalCode?: string
  country?: string
  phone?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapAddress(raw: RawOroWarehouse): Address | undefined {
  const line1 = raw.street
  const line2 = raw.street2
  const city = raw.city
  const region = raw.region ?? raw.regionText
  const postalCode = raw.postalCode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawOroWarehouse): Location {
  return {
    id: raw.id,
    name: raw.name ?? raw.label ?? '',
    active: raw.enabled,
    address: mapAddress(raw),
    phone: raw.phone,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}
