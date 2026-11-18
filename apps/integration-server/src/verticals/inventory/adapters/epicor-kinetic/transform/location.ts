/**
 * Transform Epicor Kinetic Warehouse (WarehseSvc/Warehouses) → canonical Location.
 *
 * Key Epicor fields (REST v2 WarehseSvc):
 *   WarehouseCode  — primary key / code
 *   Description    — display name
 *   Inactive       — boolean; true = inactive
 *   Plant          — manufacturing site / plant code (parent grouping)
 *   Address1-3     — address lines
 *   City, State, ZIP, Country — address components
 *   SysRowID       — stable GUID row identifier
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawEpicorKineticWarehouse {
  WarehouseCode: string
  Description?: string
  Inactive?: boolean | string
  Plant?: string
  Address1?: string
  Address2?: string
  Address3?: string
  City?: string
  State?: string
  ZIP?: string
  Country?: string
  SysRowID?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawEpicorKineticWarehouse): Location {
  const hasAddress = raw.Address1 || raw.City || raw.Country

  return {
    id:               raw.WarehouseCode,
    externalId:       raw.SysRowID ?? raw.WarehouseCode,
    name:             pickStr(raw.Description) ?? raw.WarehouseCode,
    code:             raw.WarehouseCode,
    type:             'warehouse',
    parentLocationId: pickStr(raw.Plant),
    address:          hasAddress ? {
      line1:      raw.Address1,
      line2:      raw.Address2 || raw.Address3,
      city:       raw.City,
      region:     raw.State,
      country:    raw.Country,
      postalCode: raw.ZIP,
    } : undefined,
    isActive:         !(pickBool(raw.Inactive) ?? false),
    platform:         'epicor-kinetic',
    metadata:         strMap({ plant: raw.Plant }),
    raw,
  }
}
