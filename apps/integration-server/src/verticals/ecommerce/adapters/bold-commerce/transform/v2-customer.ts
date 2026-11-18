/**
 * Bold Customers API → canonical Customer.
 *
 * Shapes from https://developer.boldcommerce.com/api/customers.openapi.yaml:
 * `v2Customer` and `v2Address`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { alpha2, compactAddress, splitTags } from '../fields'

export interface RawBoldAddress {
  id?: number
  first_name?: string
  last_name?: string
  company?: string
  street_1?: string
  street_2?: string
  city?: string
  province?: string
  province_code?: string
  country?: string
  country_iso2?: string
  zip?: string
  phone?: string
  is_default?: boolean
  [key: string]: unknown
}

export interface RawBoldCustomer {
  id: number
  shop_identifier?: string
  platform_id?: string
  platform_type?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  tags?: string
  platform_created_at?: string
  created_at?: string
  updated_at?: string | null
  deleted_at?: string | null
  addresses?: RawBoldAddress[]
  default_address?: RawBoldAddress
  [key: string]: unknown
}

export function transformBoldAddress(raw: RawBoldAddress): Address | undefined {
  return compactAddress({
    line1: raw.street_1,
    line2: raw.street_2,
    city: raw.city,
    region: raw.province_code,
    postalCode: raw.zip,
    country: alpha2(raw.country_iso2),
  })
}

export function transformBoldCustomer(raw: RawBoldCustomer): Customer {
  const out: Customer = {
    id: String(raw.id),
    metadata: { ...raw },
  }
  if (raw.email) out.email = raw.email
  if (raw.first_name) out.firstName = raw.first_name
  if (raw.last_name) out.lastName = raw.last_name
  if (raw.phone) out.phone = raw.phone
  const tags = splitTags(raw.tags)
  if (tags) out.tags = tags
  if (raw.default_address) {
    const address = transformBoldAddress(raw.default_address)
    if (address) out.defaultAddress = address
  }
  if (raw.addresses) {
    out.addresses = raw.addresses
      .map(transformBoldAddress)
      .filter((a): a is Address => a !== undefined)
  }
  // `platform_created_at`: "the customer was created on the platform";
  // `updated_at`: "If the customer was not updated, this value is the same as
  // `platform_created_at`."
  const createdAt = toIsoDatetime(raw.platform_created_at)
  if (createdAt) out.createdAt = createdAt
  const updatedAt = toIsoDatetime(raw.updated_at)
  if (updatedAt) out.updatedAt = updatedAt
  return out
}
