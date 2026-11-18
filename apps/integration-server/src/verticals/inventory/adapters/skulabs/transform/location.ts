import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawSkulabsWarehouse {
  _id: string
  name?: string
  type?: string
  store_id?: string
  is_default?: boolean
  address?: {
    address?: string
    city?: string
    state?: string
    postal_code?: string
    country_code?: string
    phone?: string
    company?: string
    name?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawSkulabsWarehouse): Location {
  return {
    id: raw._id,
    externalId: raw._id,
    name: pickStr(raw.name) ?? '',
    type: 'warehouse',
    address: raw.address ? {
      line1: pickStr(raw.address.address),
      city: pickStr(raw.address.city),
      region: pickStr(raw.address.state),
      postalCode: pickStr(raw.address.postal_code),
      country: pickStr(raw.address.country_code),
    } : undefined,
    isActive: true,
    platform: 'skulabs',
    metadata: strMap({ type: raw.type, storeId: raw.store_id, isDefault: raw.is_default }),
    raw,
  }
}
