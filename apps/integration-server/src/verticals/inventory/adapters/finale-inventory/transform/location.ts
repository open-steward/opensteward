import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawFinaleInventoryLocation {
  ID: string
  Name?: string
  ShortCode?: string
  IsDefault?: boolean | string
  IsActive?: boolean | string
  ParentLocationID?: string
  Address?: { Line1?: string; Line2?: string; City?: string; State?: string; Country?: string; PostalCode?: string }
  [key: string]: unknown
}

export function transformLocation(raw: RawFinaleInventoryLocation): Location {
  return {
    id: raw.ID,
    externalId: raw.ID,
    name: pickStr(raw.Name) ?? '',
    code: pickStr(raw.ShortCode),
    type: 'warehouse',
    parentLocationId: pickStr(raw.ParentLocationID),
    address: raw.Address ? {
      line1: raw.Address.Line1, line2: raw.Address.Line2, city: raw.Address.City,
      region: raw.Address.State, country: raw.Address.Country, postalCode: raw.Address.PostalCode,
    } : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'finale-inventory',
    metadata: strMap({ isDefault: raw.IsDefault }),
    raw,
  }
}
