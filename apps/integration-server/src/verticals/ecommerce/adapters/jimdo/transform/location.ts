/**
 * Shopify Location → canonical Location.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawShopifyLocation {
  id: number | string
  name: string
  active?: boolean
  address1?: string | null
  address2?: string | null
  city?: string | null
  zip?: string | null
  province?: string | null
  province_code?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  legacy?: boolean
  localized_country_name?: string
  localized_province_name?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawShopifyLocation): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.province ?? raw.province_code ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawShopifyLocation): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: raw.active,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    // Shopify does not expose a separate "retail-only" flag here; assume
    // active non-legacy locations are fulfillment centres.
    isFulfillmentCenter: raw.active !== false && raw.legacy !== true ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformLocation(location: Partial<Location>): Record<string, unknown> {
  return {
    name: location.name,
    active: location.active,
    address1: location.address?.line1,
    address2: location.address?.line2,
    city: location.address?.city,
    zip: location.address?.postalCode,
    province: location.address?.region,
    country_code: location.address?.country,
    phone: location.phone,
  }
}
