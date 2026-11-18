/**
 * eBay Merchant Location → canonical Location.
 *
 * eBay's Sell Inventory API exposes merchant locations for fulfillment:
 *   GET /sell/inventory/v1/location → list
 *   GET /sell/inventory/v1/location/{merchantLocationKey} → get
 *
 * Locations have address, phone, operating hours, and a merchant-defined
 * key used as the canonical `id`.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayAddress {
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateOrProvince?: string
  postalCode?: string
  country?: string
}

export interface RawEbayLocation {
  merchantLocationKey: string
  name?: string
  merchantLocationStatus?: string
  location?: {
    address?: RawEbayAddress
  }
  locationTypes?: string[]
  phone?: string
  locationWebUrl?: string
  locationInstructions?: string
  operatingHours?: unknown[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawEbayAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.addressLine1,
    line2: raw.addressLine2,
    city: raw.city,
    region: raw.stateOrProvince,
    postalCode: raw.postalCode,
    country: raw.country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawEbayLocation): Location {
  const isFulfillment = raw.locationTypes?.some(
    (t) => t === 'WAREHOUSE' || t === 'FULFILLMENT_CENTER',
  )

  return {
    id: raw.merchantLocationKey,
    name: raw.name ?? raw.merchantLocationKey,
    active: raw.merchantLocationStatus === 'ENABLED',
    address: mapAddress(raw.location?.address),
    phone: raw.phone,
    isFulfillmentCenter: isFulfillment,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
