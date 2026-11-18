/**
 * Coupang outbound shipping location → canonical Location.
 *
 * GET /v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound
 * returns `content[]` of shipping locations
 * (https://developers.coupang.com/en/api/logistics/query-a-shipping-location).
 * Every field read below is in that page's response table.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '@opensteward/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawCoupangPlaceAddress {
  /** "Address type: JIBUN, ROADNAME, OVERSEA" */
  addressType?: string
  /** "Country code, 'KR' for domestic address. Valid length: 2" */
  countryCode?: string
  /** "Phone number" */
  companyContactNumber?: string
  phoneNumber2?: string
  /** "Zipcode: number 5~6 digits" */
  returnZipCode?: string
  /** "Address Up to 150 characters" */
  returnAddress?: string
  /** "Detailed address Up to 200 characters" */
  returnAddressDetail?: string
  [key: string]: unknown
}

export interface RawCoupangShippingPlace {
  /** "Shipping location code" */
  outboundShippingPlaceCode?: number
  /** "Shipping location name" */
  shippingPlaceName?: string
  placeAddresses?: RawCoupangPlaceAddress[]
  /** "Whether it is usable" */
  usable?: boolean
  /** "Date of creation YYYY/MM/DD" */
  createDate?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ROADNAME first when a location lists several address forms, else the first. */
function pickAddress(raw: RawCoupangShippingPlace): RawCoupangPlaceAddress | undefined {
  const places = raw.placeAddresses ?? []
  return places.find((p) => p.addressType === 'ROADNAME') ?? places[0]
}

function toAddress(place: RawCoupangPlaceAddress | undefined): Address | undefined {
  if (!place) return undefined
  return {
    line1: place.returnAddress,
    line2: place.returnAddressDetail,
    postalCode: place.returnZipCode,
    country: place.countryCode,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawCoupangShippingPlace): Location {
  if (raw.outboundShippingPlaceCode == null) {
    throw new Error('Coupang shipping location has no outboundShippingPlaceCode')
  }
  const id = String(raw.outboundShippingPlaceCode)
  if (!raw.shippingPlaceName) {
    throw new Error(`Coupang shipping location ${id} has no shippingPlaceName`)
  }
  const place = pickAddress(raw)
  return {
    id,
    name: raw.shippingPlaceName,
    active: raw.usable,
    address: toAddress(place),
    phone: place?.companyContactNumber || undefined,
    // An outbound shipping location is where the seller ships orders from.
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
