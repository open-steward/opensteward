/**
 * Transform a Booqable location JSON:API resource into the canonical Location schema.
 *
 * Key Booqable v4 location attributes:
 *   name, address, city, region, country, zipcode, phone, email,
 *   main_address (object with structured fields), archived, created_at, updated_at
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap, unwrapAttributes, type JsonApiResource} from './shared'

export interface RawBooqableLocation extends JsonApiResource {
  type: 'locations'
}

interface LocationAttrs {
  id: string
  name?: string
  address?: string
  city?: string
  region?: string
  country?: string
  zipcode?: string
  phone?: string
  email?: string
  archived?: boolean
  main_address?: {
    address1?: string
    address2?: string
    city?: string
    region?: string
    country?: string
    zipcode?: string
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawBooqableLocation): Location {
  const attrs = unwrapAttributes(raw) as LocationAttrs
  const ma = attrs.main_address

  return {
    id: attrs.id,
    externalId: attrs.id,
    name: pickStr(attrs.name) ?? '',
    type: 'warehouse',
    address: {
      line1: pickStr(ma?.address1 ?? attrs.address),
      line2: pickStr(ma?.address2),
      city: pickStr(ma?.city ?? attrs.city),
      region: pickStr(ma?.region ?? attrs.region),
      country: pickStr(ma?.country ?? attrs.country),
      postalCode: pickStr(ma?.zipcode ?? attrs.zipcode),
    },
    isActive: !(pickBool(attrs.archived) ?? false),
    platform: 'booqable',
    metadata: strMap({
      phone: attrs.phone,
      email: attrs.email,
    }),
    raw,
  }
}
