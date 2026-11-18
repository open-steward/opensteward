/**
 * Transform Infor WMS location (warehouse / bin) records.
 *
 * Infor WMS locations are warehouses (facilities) and sub-locations (aisles,
 * zones, bins). The /WMS/locations endpoint returns warehouse-level records.
 * Key fields:
 *   warehouseId     — unique warehouse identifier / code
 *   warehouseName   — human-readable name
 *   facilityCode    — alternate facility/site code
 *   activeFlag      — "Y" / "N"
 *   address1/2      — street address lines
 *   city / stateCode / countryCode / postalCode — address components
 *   parentWarehouse — parent location for nested hierarchies
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawInforWmsLocation {
  warehouseId: string
  warehouseName?: string
  facilityCode?: string
  activeFlag?: string | boolean
  parentWarehouse?: string
  locationType?: string
  address1?: string
  address2?: string
  city?: string
  stateCode?: string
  countryCode?: string
  postalCode?: string
  phone?: string
  companyCode?: string
  [key: string]: unknown
}

function mapLocationType(t: string | undefined): 'warehouse' | 'zone' | 'bin' | 'other' {
  const s = (t ?? '').toUpperCase()
  if (s === 'WAREHOUSE' || s === 'FACILITY' || s === 'DC') return 'warehouse'
  if (s === 'ZONE' || s === 'AREA' || s === 'AISLE') return 'zone'
  if (s === 'BIN' || s === 'SLOT' || s === 'LOCATION') return 'bin'
  return 'warehouse'
}

export function transformLocation(raw: RawInforWmsLocation): Location {
  const hasAddress = raw.address1 || raw.city || raw.countryCode
  return {
    id: raw.warehouseId,
    externalId: raw.warehouseId,
    name: pickStr(raw.warehouseName) ?? raw.warehouseId,
    code: pickStr(raw.facilityCode) ?? pickStr(raw.warehouseId),
    type: mapLocationType(raw.locationType),
    parentLocationId: pickStr(raw.parentWarehouse),
    address: hasAddress ? {
      line1: raw.address1,
      line2: raw.address2,
      city: raw.city,
      region: raw.stateCode,
      country: raw.countryCode,
      postalCode: raw.postalCode,
    } : undefined,
    isActive: pickBool(raw.activeFlag) ?? ((raw.activeFlag as string) !== 'N'),
    platform: 'infor-wms',
    metadata: strMap({
      companyCode: raw.companyCode,
      phone: raw.phone,
      locationType: raw.locationType,
    }),
    raw,
  }
}
