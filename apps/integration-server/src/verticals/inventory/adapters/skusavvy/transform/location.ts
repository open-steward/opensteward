import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * SKUSavvy GraphQL location node.
 * Locations represent warehouses or fulfilment zones.
 */
export interface RawSkusavvyLocation {
  id: string
  name?: string
  code?: string
  locationType?: string
  isDefault?: boolean | string
  active?: boolean | string
  parentId?: string
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

export function transformLocation(raw: RawSkusavvyLocation): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: raw.locationType === 'bin' ? 'bin' : 'warehouse',
    parentLocationId: pickStr(raw.parentId),
    address: raw.address ? {
      line1: raw.address.address1,
      line2: raw.address.address2,
      city: raw.address.city,
      region: raw.address.province,
      country: raw.address.country,
      postalCode: raw.address.zip,
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'skusavvy',
    metadata: strMap({ isDefault: raw.isDefault, locationType: raw.locationType }),
    raw,
  }
}
