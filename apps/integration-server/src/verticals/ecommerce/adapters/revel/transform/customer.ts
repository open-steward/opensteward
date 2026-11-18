/**
 * Revel Customer → canonical Customer.
 *
 * Revel customers are accessible via `/resources/Customer/`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawRevelCustomer {
  id: number
  email?: string
  first_name?: string
  last_name?: string
  phone_number?: string
  address?: string
  city?: string
  state?: string
  zipcode?: string
  country?: string
  opt_in?: boolean
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

function mapAddress(raw: RawRevelCustomer): Address | undefined {
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: RawRevelCustomer): Customer {
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone_number ?? undefined,
    acceptsMarketing: raw.opt_in ?? undefined,
    defaultAddress: mapAddress(raw),
    createdAt: raw.created_date ?? undefined,
    updatedAt: raw.updated_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Revel customer body for create/update. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.firstName != null) body['first_name'] = customer.firstName
  if (customer.lastName != null) body['last_name'] = customer.lastName
  if (customer.email != null) body['email'] = customer.email
  if (customer.phone != null) body['phone_number'] = customer.phone
  if (customer.acceptsMarketing != null) body['opt_in'] = customer.acceptsMarketing
  if (customer.defaultAddress) {
    if (customer.defaultAddress.line1) body['address'] = customer.defaultAddress.line1
    if (customer.defaultAddress.city) body['city'] = customer.defaultAddress.city
    if (customer.defaultAddress.region) body['state'] = customer.defaultAddress.region
    if (customer.defaultAddress.postalCode) body['zipcode'] = customer.defaultAddress.postalCode
    if (customer.defaultAddress.country) body['country'] = customer.defaultAddress.country
  }
  return body
}
