/**
 * Da Vinci Unified — warehouse/location transform.
 *
 * DVU models locations as warehouses. API endpoint: /api/warehouse/warehouses.
 * Key fields: warehouseId, warehouseName, warehouseCode, isActive, isDefault,
 * address1, address2, city, state, country, postalCode.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawDaVinciUnifiedLocation {
  warehouseId: string
  warehouseName?: string
  warehouseCode?: string
  isActive?: boolean | string
  isDefault?: boolean | string
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawDaVinciUnifiedLocation): Location {
  const hasAddress = raw.address1 || raw.city || raw.country
  return {
    id: raw.warehouseId,
    externalId: raw.warehouseId,
    name: pickStr(raw.warehouseName) ?? '',
    code: pickStr(raw.warehouseCode),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress
      ? {
          line1: raw.address1,
          line2: raw.address2,
          city: raw.city,
          region: raw.state,
          country: raw.country,
          postalCode: raw.postalCode,
        }
      : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    platform: 'da-vinci-unified',
    metadata: strMap({ isDefault: raw.isDefault }),
    raw,
  }
}
