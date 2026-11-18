/**
 * Transform SYSPRO InvWhControl OData entity → canonical Location.
 *
 * SYSPRO OData entity: InvWhControl  (warehouse master)
 * Confirmed field names from SYSPRO 8 docs:
 *   Warehouse (code / key), Description, AllowNegativeStock,
 *   NettingWarehouse (parent / consolidation warehouse),
 *   Address1, Address2, Address3, Address4, Address5
 *   (SYSPRO addresses are free-form line fields, not city/state/zip)
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawSysproLocation {
  /** Warehouse code — primary key */
  Warehouse: string
  Description?: string
  /** 'Y' | 'N' */
  AllowNegativeStock?: string
  /** Code of a parent/consolidation warehouse, if any */
  NettingWarehouse?: string
  Address1?: string
  Address2?: string
  Address3?: string
  Address4?: string
  Address5?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawSysproLocation): Location {
  const hasAddress = raw.Address1 || raw.Address2 || raw.Address3

  return {
    id: raw.Warehouse,
    externalId: raw.Warehouse,
    name: pickStr(raw.Description) ?? raw.Warehouse,
    code: raw.Warehouse,
    type: 'warehouse',
    parentLocationId: pickStr(raw.NettingWarehouse),
    address: hasAddress
      ? {
          line1:      raw.Address1,
          line2:      raw.Address2,
          city:       raw.Address3,
          region:     raw.Address4,
          country:    raw.Address5,
          postalCode: undefined,
        }
      : undefined,
    isActive: true, // SYSPRO does not expose a warehouse active flag via OData
    platform: 'syspro',
    metadata: strMap({
      allowNegativeStock: raw.AllowNegativeStock,
    }),
    raw,
  }
}
