/**
 * Kibo Commerce Location → canonical Location.
 *
 * Kibo locations live at:
 *   GET /api/commerce/catalog/storefront/shippingconfigurations
 *   (warehouse locations use GET /api/commerce/catalog/admin/locationgroups)
 *
 * Key fields:
 *   - `locationCode`   → id
 *   - `name`           → name
 *   - `isActive`       → active
 *   - `address`        → address
 *   - `phone`          → phone
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawKiboLocationAddress {
  address1?: string
  address2?: string
  cityOrTown?: string
  stateOrProvince?: string
  postalOrZipCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface RawKiboLocation {
  locationCode?: string
  code?: string
  name?: string
  isActive?: boolean
  supportsInventory?: boolean
  fulfillmentTypes?: string[]
  phone?: string
  address?: RawKiboLocationAddress
  auditInfo?: { createDate?: string; updateDate?: string }
  [key: string]: unknown
}

function mapAddress(raw: RawKiboLocationAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.address1 ?? undefined,
    line2: raw.address2 ?? undefined,
    city: raw.cityOrTown ?? undefined,
    region: raw.stateOrProvince ?? undefined,
    postalCode: raw.postalOrZipCode ?? undefined,
    country: raw.countryCode ?? undefined,
  }
}

export function transformLocation(raw: RawKiboLocation): Location {
  const id = raw.locationCode ?? raw.code ?? ''
  const fulfillmentTypes = raw.fulfillmentTypes ?? []
  const isFulfillmentCenter = raw.supportsInventory === true
    || fulfillmentTypes.some((t) => t.toLowerCase().includes('ship') || t.toLowerCase().includes('fulfill'))

  return {
    id,
    name: raw.name ?? id,
    active: raw.isActive ?? undefined,
    address: mapAddress(raw.address),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter,
    metadata: raw as Record<string, unknown>,
  }
}
