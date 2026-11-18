/**
 * OpenCart Customer → canonical Customer.
 *
 * OpenCart stores customer addresses as a separate `address` array.
 * The default address is identified by `address_id` matching
 * the customer's `address_id` field.
 *
 * Key mappings:
 *  - `customer_id` → `id` (stringified)
 *  - `firstname` + `lastname` → `firstName` / `lastName`
 *  - `email` → `email`
 *  - `telephone` → `phone`
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawOpenCartAddress {
  address_id?: number | string
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  zone?: string | null
  zone_id?: number | string
  postcode?: string | null
  country?: string | null
  country_id?: number | string
  [key: string]: unknown
}

export interface RawOpenCartCustomer {
  customer_id: number | string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  telephone?: string | null
  address_id?: number | string
  addresses?: RawOpenCartAddress[]
  status?: number | string
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

function mapAddress(raw: RawOpenCartAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const line2 = raw.address_2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.zone ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawOpenCartCustomer): Customer {
  const addresses: Address[] = []
  let defaultAddress: Address | undefined

  if (raw.addresses) {
    for (const addr of raw.addresses) {
      const mapped = mapAddress(addr)
      if (mapped) {
        addresses.push(mapped)
        if (
          raw.address_id != null &&
          addr.address_id != null &&
          String(addr.address_id) === String(raw.address_id)
        ) {
          defaultAddress = mapped
        }
      }
    }
  }
  if (!defaultAddress && addresses.length > 0) {
    defaultAddress = addresses[0]
  }

  return {
    id: String(raw.customer_id),
    email: raw.email ?? undefined,
    firstName: raw.firstname ?? undefined,
    lastName: raw.lastname ?? undefined,
    phone: raw.telephone ?? undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.date_added),
    updatedAt: toIsoDatetime(raw.date_modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    telephone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['address'] = {
      address_1: a.line1,
      address_2: a.line2,
      city: a.city,
      zone: a.region,
      postcode: a.postalCode,
      country: a.country,
    }
  }
  return body
}
