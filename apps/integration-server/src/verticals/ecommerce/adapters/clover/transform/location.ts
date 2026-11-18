/**
 * Clover Merchant → canonical Location.
 *
 * In Clover, the merchant itself IS the location. We return a
 * synthetic single location from the merchant info.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawCloverMerchant {
  id: string
  name?: string
  address?: {
    address1?: string
    address2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  phoneNumber?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCloverMerchant['address']): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawCloverMerchant): Location {
  return {
    id: raw.id,
    name: raw.name ?? '',
    active: true,
    address: mapAddress(raw.address),
    phone: raw.phoneNumber ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
