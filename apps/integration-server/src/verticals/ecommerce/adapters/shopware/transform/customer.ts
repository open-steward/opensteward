/**
 * Shopware 6 Customer → canonical Customer.
 *
 * Shopware customers live under `/api/customer`. They have:
 *  - `defaultBillingAddress` / `defaultShippingAddress` associations.
 *  - `addresses[]` — all saved addresses.
 *  - `email`, `firstName`, `lastName`, `customerNumber`.
 *  - `group` — customer group association.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawShopwareAddress {
  id?: string
  firstName?: string
  lastName?: string
  street?: string
  additionalAddressLine1?: string | null
  zipcode?: string
  city?: string
  country?: { id?: string; iso?: string; name?: string } | null
  countryState?: { id?: string; shortCode?: string; name?: string } | null
  phoneNumber?: string | null
  [key: string]: unknown
}

export interface RawShopwareCustomer {
  id: string
  customerNumber?: string
  email?: string
  firstName?: string
  lastName?: string
  active?: boolean
  guest?: boolean
  defaultBillingAddress?: RawShopwareAddress | null
  defaultShippingAddress?: RawShopwareAddress | null
  addresses?: RawShopwareAddress[]
  orderCount?: number
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawShopwareAddress | undefined | null): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street
  const line2 = raw.additionalAddressLine1 ?? undefined
  const city = raw.city
  const region = raw.countryState?.name ?? raw.countryState?.shortCode
  const postalCode = raw.zipcode
  const country = raw.country?.iso ?? raw.country?.name
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawShopwareCustomer): Customer {
  const allAddresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)
  const defaultAddr = mapAddress(raw.defaultBillingAddress) ?? allAddresses[0]
  const phone = raw.defaultBillingAddress?.phoneNumber ?? undefined

  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone,
    ordersCount: raw.orderCount,
    defaultAddress: defaultAddr,
    addresses: allAddresses.length > 0 ? allAddresses : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['defaultBillingAddress'] = {
      street: a.line1,
      additionalAddressLine1: a.line2,
      zipcode: a.postalCode,
      city: a.city,
      phoneNumber: customer.phone,
    }
  }
  return body
}
