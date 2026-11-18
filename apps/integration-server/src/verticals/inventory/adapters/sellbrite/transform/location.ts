import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Sellbrite warehouse shape — from GET /warehouses.
 * Field names follow Sellbrite's API (snake_case).
 */
export interface RawSellbriteWarehouse {
  uuid: string
  name?: string
  inventory_master?: boolean | string
  address_1?: string
  address_2?: string
  city?: string
  state_region?: string
  postal_code?: string
  country_code?: string
  archived?: boolean | string
  [key: string]: unknown
}

export function transformLocation(raw: RawSellbriteWarehouse): Location {
  const archived = pickBool(raw.archived)
  const isActive = archived !== true

  const hasAddress = raw.address_1 || raw.city || raw.state_region || raw.country_code
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    name: pickStr(raw.name) ?? '',
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress ? {
      line1: pickStr(raw.address_1),
      line2: pickStr(raw.address_2),
      city: pickStr(raw.city),
      region: pickStr(raw.state_region),
      country: pickStr(raw.country_code),
      postalCode: pickStr(raw.postal_code),
    } : undefined,
    isActive,
    platform: 'sellbrite',
    metadata: strMap({ inventoryMaster: raw.inventory_master }),
    raw,
  }
}
