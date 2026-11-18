/**
 * Commerce Layer Stock Location → canonical Location.
 *
 * Commerce Layer stock locations represent physical warehouses or
 * fulfillment centers where inventory is stored.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawCLStockLocation {
  id: string
  name?: string
  label_format?: string
  suppress_etd?: boolean
  created_at?: string
  updated_at?: string
  // Address fields (from included address or inline)
  address?: {
    line_1?: string
    line_2?: string
    city?: string
    state_code?: string
    zip_code?: string
    country_code?: string
    phone?: string
  }
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapAddress(raw: RawCLStockLocation): Address | undefined {
  const addr = raw.address
  if (!addr) return undefined
  const line1 = addr.line_1
  const line2 = addr.line_2
  const city = addr.city
  const region = addr.state_code
  const postalCode = addr.zip_code
  const country = addr.country_code
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawCLStockLocation): Location {
  return {
    id: raw.id,
    name: raw.name ?? '',
    active: true,
    address: mapAddress(raw),
    phone: raw.address?.phone,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformLocation(
  location: Partial<Location>,
): Record<string, unknown> {
  return {
    data: {
      type: 'stock_locations',
      attributes: {
        name: location.name,
      },
    },
  }
}
