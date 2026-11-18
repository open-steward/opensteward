import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Raw warehouse object returned by GET /api/v1/warehouses.
 */
export interface RawPredikoWarehouse {
  id: string
  name?: string
  active?: boolean
  store_name?: string
  is_combined?: boolean
  child_warehouses?: string[]
  address?: {
    address1?: string
    address2?: string
    city?: string
    province?: string
    country?: string
    zip?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawPredikoWarehouse): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.address ? {
      line1: raw.address.address1,
      line2: raw.address.address2,
      city: raw.address.city,
      region: raw.address.province,
      country: raw.address.country,
      postalCode: raw.address.zip,
    } : undefined,
    isActive: raw.active ?? true,
    platform: 'prediko',
    metadata: strMap({
      storeName: raw.store_name,
      isCombined: raw.is_combined,
    }),
    raw,
  }
}
