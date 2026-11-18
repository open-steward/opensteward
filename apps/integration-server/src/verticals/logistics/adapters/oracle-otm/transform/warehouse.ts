/**
 * Oracle Transportation Management (OTM) Location → canonical Warehouse.
 *
 * OTM models warehouse/facility locations via:
 *   GET /locations              (list)
 *   GET /locations/{locationGid}  (single)
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/transportation/26a/otmra/op-locations-locationgid-get.html
 */

import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

export interface OracleOtmLocationResponse {
  locationGid?: string
  locationXid?: string
  locationName?: string
  city?: string
  province?: string
  provinceCode?: string
  postalCode?: string
  countryCode3Gid?: string
  timeZoneGid?: string
  isActive?: boolean
  description?: string
  isWmsFacility?: boolean
  insertDate?: { value?: string }
  updateDate?: { value?: string }
  addresses?: { items?: OracleOtmLocationAddress[] }
  [key: string]: unknown
}

export interface OracleOtmLocationAddress {
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  provinceCode?: string
  postalCode?: string
  countryCode3Gid?: string
  [key: string]: unknown
}

export interface OracleOtmLocationsListResponse {
  items?: OracleOtmLocationResponse[]
  count?: number
  hasMore?: boolean
  totalResults?: number
  links?: unknown[]
  [key: string]: unknown
}

/** Derive ISO 3166-2 two-letter country code from OTM's three-digit GID (e.g. "USA" → "US"). */
function toCountry2(code3Gid: string | undefined): string | undefined {
  if (!code3Gid) return undefined
  // Strip domain prefix if present (e.g. "SAMPLE.USA" → "USA")
  const raw = code3Gid.includes('.') ? code3Gid.split('.').slice(1).join('.') : code3Gid
  // Common mappings for ISO 3166-1 alpha-3 → alpha-2
  const MAP: Record<string, string> = {
    USA: 'US', GBR: 'GB', CAN: 'CA', AUS: 'AU', DEU: 'DE', FRA: 'FR',
    CHN: 'CN', JPN: 'JP', IND: 'IN', BRA: 'BR', MEX: 'MX', NLD: 'NL',
    ITA: 'IT', ESP: 'ES', KOR: 'KR', SGP: 'SG', HKG: 'HK', TWN: 'TW',
    CHE: 'CH', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL',
    BEL: 'BE', AUT: 'AT', PRT: 'PT', GRC: 'GR', CZE: 'CZ', HUN: 'HU',
    ROU: 'RO', IDN: 'ID', THA: 'TH', MYS: 'MY', PHL: 'PH', VNM: 'VN',
  }
  return MAP[raw.toUpperCase()] ?? (raw.length === 2 ? raw.toUpperCase() : undefined)
}

export function transformWarehouse(raw: OracleOtmLocationResponse): Warehouse {
  // OTM stores address lines in the expandable `addresses` child collection.
  // When not expanded, fall back to top-level city/province/postalCode fields.
  const firstAddr = raw.addresses?.items?.[0]
  const addressRaw: Record<string, unknown> = {
    street1: firstAddr?.addressLine1,
    street2: firstAddr?.addressLine2,
    city: firstAddr?.city ?? raw.city,
    state: firstAddr?.provinceCode ?? firstAddr?.province ?? raw.provinceCode ?? raw.province,
    postalCode: firstAddr?.postalCode ?? raw.postalCode,
    country: toCountry2(firstAddr?.countryCode3Gid ?? raw.countryCode3Gid),
  }
  const address = toAddress(addressRaw)

  // OTM timeZoneGid is like "DOMAIN.America/Los_Angeles" — strip domain prefix
  let timezone: string | undefined
  if (raw.timeZoneGid) {
    const tz = raw.timeZoneGid.includes('.')
      ? raw.timeZoneGid.split('.').slice(1).join('.')
      : raw.timeZoneGid
    timezone = tz || undefined
  }

  return {
    id: raw.locationGid ?? undefined,
    name: raw.locationName ?? raw.locationXid ?? undefined,
    code: raw.locationXid ?? undefined,
    address,
    isActive: raw.isActive ?? undefined,
    timezone,
    createdAt: toISODate(raw.insertDate?.value),
    updatedAt: toISODate(raw.updateDate?.value),
    metadata: raw as Record<string, unknown>,
  }
}
