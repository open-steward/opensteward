/**
 * Transform Wasp InventoryCloud location/site → canonical Location.
 *
 * InventoryCloud has two levels of physical location:
 *   Sites     — top-level warehouses/facilities (public-api/sites/...)
 *   Locations — sub-locations within a site (public-api/locations/...)
 *
 * Both are mapped to the canonical Location; Sites get type='warehouse',
 * Locations get type='bin' with parentLocationId pointing at the site name.
 *
 * Observed fields from advancedinfosearch responses:
 *   LocationCode  / SiteName — primary identifiers
 *   LocationName  / Description
 *   IsActive
 *   SiteName      — for sub-locations, name of parent site
 */
import type { Location } from '../../../schema/location'
import { pickStr, pickBool, strMap } from './shared'

export interface RawWaspBarcodeLocation {
  LocationCode?: string
  LocationName?: string
  SiteName?: string // present on sub-locations; also the id for site records
  Description?: string
  IsActive?: boolean | string | number
  IsDefault?: boolean | string | number
  Address1?: string
  Address2?: string
  City?: string
  State?: string
  Country?: string
  Zip?: string
  [key: string]: unknown
}

/** isSite=true when the raw record comes from the /sites endpoint */
export function transformLocation(raw: RawWaspBarcodeLocation, isSite = false): Location {
  const id = isSite
    ? (pickStr(raw.SiteName) ?? '')
    : (pickStr(raw.LocationCode) ?? pickStr(raw.SiteName) ?? '')

  const hasAddress = raw.Address1 || raw.City || raw.State || raw.Zip

  return {
    id,
    externalId: id,
    name: pickStr(raw.LocationName ?? raw.SiteName ?? raw.Description) ?? '',
    code: isSite ? undefined : pickStr(raw.LocationCode),
    type: 'warehouse',
    parentLocationId: !isSite ? pickStr(raw.SiteName) : undefined,
    address: hasAddress
      ? {
          line1: pickStr(raw.Address1),
          line2: pickStr(raw.Address2),
          city: pickStr(raw.City),
          region: pickStr(raw.State),
          country: pickStr(raw.Country),
          postalCode: pickStr(raw.Zip),
        }
      : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'wasp-barcode',
    metadata: strMap({
      isDefault: raw.IsDefault,
      description: raw.Description,
      ...(!isSite ? { rawLocationType: 'bin' } : {}),
    }),
    raw,
  }
}
