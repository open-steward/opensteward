/**
 * BetterCommerce Store / Location → canonical Location.
 *
 * BetterCommerce exposes store/warehouse locations under
 * `/api/v2/stores` (or `/api/v2/stores/all`). Each store entry maps to a
 * canonical Location.
 *
 * Field mapping:
 *  storeId / recordId   → id
 *  storeName / name     → name
 *  isActive / active    → active
 *  address1             → address.line1
 *  address2             → address.line2
 *  city                 → address.city
 *  state                → address.region
 *  postCode             → address.postalCode
 *  countryCode / country → address.country
 *  phone / phoneNo      → phone
 *  isWarehouse          → isFulfillmentCenter
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawBCStore {
  storeId?: string
  recordId?: string
  storeName?: string
  name?: string
  isActive?: boolean
  active?: boolean
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postCode?: string | null
  country?: string | null
  countryCode?: string | null
  phone?: string | null
  phoneNo?: string | null
  isWarehouse?: boolean
  [key: string]: unknown
}

function mapAddress(raw: RawBCStore): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postCode ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawBCStore): Location {
  const active = raw.isActive ?? raw.active
  return {
    id: raw.storeId ?? raw.recordId ?? '',
    name: raw.storeName ?? raw.name ?? '',
    active,
    address: mapAddress(raw),
    phone: raw.phone ?? raw.phoneNo ?? undefined,
    isFulfillmentCenter: raw.isWarehouse !== false && active !== false ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
