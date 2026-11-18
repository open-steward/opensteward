/**
 * Transform Crunchtime Location → canonical Location.
 *
 * Source: GET /location/v1/getAllLocations
 *         GET /location/v1/getLocationsByPage
 *
 * Key Crunchtime field names:
 *   locationCode, locationName, city, stateProvince, country, market,
 *   franchiseCode, activeFlag, corporate, createDate, lastEditDate
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawCrunchtimeLocation {
  locationCode: string
  locationName?: string
  city?: string
  stateProvince?: string
  country?: string
  market?: string
  franchiseCode?: string
  exportCode?: string
  payrollExportCode?: string
  activeFlag?: boolean | string
  corporate?: boolean | string
  createDate?: string
  lastEditDate?: string
  lastEditUser?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawCrunchtimeLocation): Location {
  const hasAddress = raw.city || raw.stateProvince || raw.country
  return {
    id: raw.locationCode,
    externalId: raw.locationCode,
    name: pickStr(raw.locationName) ?? raw.locationCode,
    code: raw.locationCode,
    type: 'store',
    address: hasAddress
      ? {
          city: raw.city,
          region: raw.stateProvince,
          country: raw.country,
        }
      : undefined,
    isActive: pickBool(raw.activeFlag) ?? true,
    platform: 'crunchtime',
    metadata: strMap({
      market: raw.market,
      franchiseCode: raw.franchiseCode,
      exportCode: raw.exportCode,
      payrollExportCode: raw.payrollExportCode,
      lastEditUser: raw.lastEditUser,
      corporate: raw.corporate != null ? String(raw.corporate) : undefined,
    }),
    raw,
  }
}
