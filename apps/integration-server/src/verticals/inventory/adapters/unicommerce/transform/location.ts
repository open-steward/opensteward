/**
 * Transform Unicommerce facility → canonical Location.
 *
 * Source endpoints:
 *   POST /services/rest/v1/facility/search  → parties[]  (summary list)
 *   POST /services/rest/v1/facility/get     → facility   (full detail)
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/** Summary record returned by facility/search. */
export interface RawUnicommerceFacilitySummary {
  facilityCode?: string
  facilityStatus?: string
  created?: number | string
  updated?: number | string
  [key: string]: unknown
}

/** Full record returned by facility/get. */
export interface RawUnicommerceFacility {
  code?: string
  name?: string
  displayName?: string
  type?: string
  operationalType?: string
  alternateCode?: string
  enabled?: boolean
  billingAddress?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    pincode?: string
    stateName?: string
    stateCode?: string
    countryName?: string
    countryCode?: string
    phone?: string
    email?: string
  }
  shippingAddress?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    pincode?: string
    stateName?: string
    stateCode?: string
    countryName?: string
    countryCode?: string
    phone?: string
    email?: string
  }
  [key: string]: unknown
}

export type RawUnicommerceLocation = RawUnicommerceFacility | RawUnicommerceFacilitySummary

function isFull(r: RawUnicommerceLocation): r is RawUnicommerceFacility {
  return 'name' in r || 'displayName' in r || 'billingAddress' in r
}

export function transformLocation(raw: RawUnicommerceLocation): Location {
  if (isFull(raw)) {
    const addr = raw.shippingAddress ?? raw.billingAddress
    const code = pickStr(raw.code) ?? ''
    return {
      id: code,
      externalId: code,
      name: pickStr(raw.displayName) ?? pickStr(raw.name) ?? code,
      code,
      type: 'warehouse',
      address: addr
        ? {
            line1: addr.addressLine1,
            line2: addr.addressLine2,
            city: addr.city,
            region: addr.stateName ?? addr.stateCode,
            country: addr.countryCode ?? addr.countryName,
            postalCode: addr.pincode,
          }
        : undefined,
      isActive: raw.enabled !== false,
      platform: 'unicommerce',
      metadata: strMap({
        type: raw.type,
        operationalType: raw.operationalType,
        alternateCode: raw.alternateCode,
      }),
      raw,
    }
  }

  // Summary (facility/search result)
  const code = pickStr(raw.facilityCode) ?? ''
  return {
    id: code,
    externalId: code,
    name: code,
    code,
    type: 'warehouse',
    isActive: (raw.facilityStatus ?? '').toUpperCase() === 'ENABLED',
    platform: 'unicommerce',
    metadata: strMap({ facilityStatus: raw.facilityStatus }),
    raw,
  }
}
