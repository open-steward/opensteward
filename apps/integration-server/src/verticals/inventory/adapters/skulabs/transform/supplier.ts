import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

export interface RawSkulabsDistributor {
  _id: string
  name?: string
  phone?: string | null
  email?: string | null
  active?: boolean
  address?: {
    street?: string
    street_2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  terms?: string | null
  shipping?: string | null
  memo?: string | null
  location_id?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawSkulabsDistributor): Supplier {
  return {
    id: raw._id,
    externalId: raw._id,
    name: pickStr(raw.name) ?? '',
    email: raw.email ? pickStr(raw.email) : undefined,
    phone: raw.phone ? pickStr(raw.phone) : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'skulabs',
    metadata: strMap({ terms: raw.terms, shipping: raw.shipping, locationId: raw.location_id }),
    raw,
  }
}
