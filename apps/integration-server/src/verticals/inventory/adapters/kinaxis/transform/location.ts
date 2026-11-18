/**
 * Kinaxis Maestro Site → Location transform.
 *
 * In RapidResponse / Maestro a "Site" represents a physical facility
 * (factory, warehouse, distribution centre). Key fields:
 *   id          — system-assigned UUID
 *   name        — display name (e.g. "Toronto DC")
 *   siteCode    — short alphanumeric identifier (e.g. "TOR-DC")
 *   siteType    — "Manufacturing" | "Distribution" | "Supplier" | "Customer"
 *   status      — "Active" | "Inactive"
 *   parentSiteId — parent in the site hierarchy
 *   address     — nested object: street, city, stateProvince, country, postalCode
 *   timeZone    — IANA tz string
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawKinaxisSite {
  id: string
  name?: string
  siteCode?: string
  siteType?: string
  status?: string
  parentSiteId?: string
  address?: {
    street?: string
    street2?: string
    city?: string
    stateProvince?: string
    country?: string
    postalCode?: string
  }
  timeZone?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawKinaxisSite): Location {
  const isActive = raw.status ? raw.status.toLowerCase() === 'active' : true
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? raw.id,
    code: pickStr(raw.siteCode),
    type: 'warehouse',
    parentLocationId: pickStr(raw.parentSiteId),
    address: raw.address
      ? {
          line1: raw.address.street,
          line2: raw.address.street2,
          city: raw.address.city,
          region: raw.address.stateProvince,
          country: raw.address.country,
          postalCode: raw.address.postalCode,
        }
      : undefined,
    isActive,
    platform: 'kinaxis',
    metadata: strMap({ siteType: raw.siteType, status: raw.status, timeZone: raw.timeZone }),
    raw,
  }
}
