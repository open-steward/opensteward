/**
 * Openbravo Warehouse → canonical Location.
 *
 * Entity: Warehouse (table: M_Warehouse)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/Warehouse
 *
 * Openbravo's "Warehouse" is the top-level location. Storage bins (M_Locator)
 * are children of a warehouse; we map warehouses as type 'warehouse'.
 *
 * Fields used:
 *   id, searchKey (code), name, active, organization._identifier,
 *   locationAddress.addressLine1/2, locationAddress.cityName,
 *   locationAddress.region, locationAddress.countryId._identifier,
 *   locationAddress.postalCode, creationDate, updated
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawOpenbravoWarehouse {
  /** UUID primary key */
  id: string
  /** Internal search key / code */
  searchKey?: string
  name?: string
  /** "Y" = active */
  active?: boolean | string
  organization?: { id?: string; _identifier?: string }
  locationAddress?: {
    addressLine1?: string
    addressLine2?: string
    cityName?: string
    /** region name or code */
    region?: string
    /** country reference */
    countryId?: { _identifier?: string }
    postalCode?: string
  }
  creationDate?: string
  updated?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawOpenbravoWarehouse): Location {
  const addr = raw.locationAddress
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.searchKey),
    type: 'warehouse',
    address: addr
      ? {
          line1: pickStr(addr.addressLine1),
          line2: pickStr(addr.addressLine2),
          city: pickStr(addr.cityName),
          region: pickStr(addr.region),
          country: pickStr(addr.countryId?._identifier),
          postalCode: pickStr(addr.postalCode),
        }
      : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'openbravo',
    metadata: strMap({
      organizationId: raw.organization?.id,
      creationDate: toIso(raw.creationDate),
      updated: toIso(raw.updated),
    }),
    raw,
  }
}
