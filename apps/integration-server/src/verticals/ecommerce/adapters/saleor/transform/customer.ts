/**
 * Saleor Customer (User) → canonical Customer.
 *
 * Fields per docs.saleor.io/api-reference/users/objects/user. User has no
 * phone (only an Address does, and an address's phone is not the customer's),
 * and its `orders` connection "Requires one of the following permissions:
 * MANAGE_STAFF OWNER", so neither `phone` nor `ordersCount` is mapped.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawSaleorAddress {
  streetAddress1?: string | null
  streetAddress2?: string | null
  city?: string | null
  countryArea?: string | null
  postalCode?: string | null
  country?: { code?: string } | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawSaleorCustomer {
  id: string
  email?: string
  firstName?: string | null
  lastName?: string | null
  isActive?: boolean
  defaultShippingAddress?: RawSaleorAddress | null
  addresses?: RawSaleorAddress[]
  dateJoined?: string
  updatedAt?: string
  note?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawSaleorAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  // Address's text fields are `String!` and come back '' when unset.
  const line1 = raw.streetAddress1 || undefined
  const city = raw.city || undefined
  const postalCode = raw.postalCode || undefined
  const country = raw.country?.code || undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.streetAddress2 || undefined,
    city,
    region: raw.countryArea || undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawSaleorCustomer): Customer {
  const addresses = raw.addresses?.map((a) => mapAddress(a)).filter((a): a is Address => !!a)

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    defaultAddress: mapAddress(raw.defaultShippingAddress),
    addresses: addresses && addresses.length > 0 ? addresses : undefined,
    createdAt: raw.dateJoined,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    note: undefined,
  }
}
