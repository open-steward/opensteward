/**
 * Vendure Customer -> canonical Customer.
 *
 * Vendure customers have first/last name, email, phone, and addresses.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawVendureAddress {
  id?: string
  streetLine1?: string | null
  streetLine2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  country?: { code?: string; name?: string } | null
  phoneNumber?: string | null
  defaultShippingAddress?: boolean
  defaultBillingAddress?: boolean
  [key: string]: unknown
}

export interface RawVendureCustomer {
  id: string
  firstName?: string | null
  lastName?: string | null
  emailAddress?: string | null
  phoneNumber?: string | null
  orders?: { totalItems?: number } | null
  addresses?: RawVendureAddress[]
  user?: { id?: string } | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawVendureAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.streetLine1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.country?.code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.streetLine2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawVendureCustomer): Customer {
  const ordersCount = raw.orders?.totalItems ?? undefined
  const addresses = raw.addresses
    ?.map((a) => mapAddress(a))
    .filter((a): a is Address => !!a)

  const defaultAddr = raw.addresses?.find(
    (a) => a.defaultShippingAddress || a.defaultBillingAddress,
  )

  return {
    id: String(raw.id),
    email: raw.emailAddress ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    ordersCount: ordersCount != null ? ordersCount : undefined,
    defaultAddress: mapAddress(defaultAddr),
    addresses: addresses && addresses.length > 0 ? addresses : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    emailAddress: customer.email,
    phoneNumber: customer.phone,
  }
}
