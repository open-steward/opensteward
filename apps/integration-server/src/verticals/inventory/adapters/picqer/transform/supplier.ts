import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Raw supplier object from GET /suppliers or GET /suppliers/{idsupplier}.
 *
 * Field reference: https://picqer.com/en/api/suppliers
 * Picqer's supplier object does not expose currency, lead-time, or active
 * status fields — all suppliers returned by the API are treated as active.
 */
export interface RawPicqerSupplier {
  idsupplier: number
  name: string
  contactname?: string
  address?: string
  address2?: string
  zipcode?: string
  city?: string
  region?: string
  country?: string
  telephone?: string
  emailaddress?: string
  remarks?: string
  language?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawPicqerSupplier): Supplier {
  const idStr = String(raw.idsupplier)
  return {
    id: idStr,
    externalId: idStr,
    name: raw.name,
    email: pickStr(raw.emailaddress),
    phone: pickStr(raw.telephone),
    isActive: true,
    platform: 'picqer',
    metadata: strMap({
      contactname: raw.contactname,
      language: raw.language,
      address: raw.address,
      address2: raw.address2,
      zipcode: raw.zipcode,
      city: raw.city,
      region: raw.region,
      country: raw.country,
    }),
    raw,
  }
}
