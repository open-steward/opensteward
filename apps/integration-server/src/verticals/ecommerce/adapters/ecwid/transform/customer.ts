/**
 * Ecwid Customer → canonical Customer.
 *
 * Ecwid stores billing and shipping addresses on customers. The
 * `shippingAddresses` array contains multiple addresses; we use the
 * first billing address as the default. `totalStoreCredit` and
 * `orderCount` map directly.
 *
 * Docs: https://developer.ecwid.com/
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawEcwidAddress {
  name?: string | null
  companyName?: string | null
  street?: string | null
  city?: string | null
  countryCode?: string | null
  countryName?: string | null
  postalCode?: string | null
  stateOrProvinceCode?: string | null
  stateOrProvinceName?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawEcwidCustomer {
  id: number | string
  email?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  billingPerson?: RawEcwidAddress | null
  shippingAddresses?: RawEcwidAddress[] | null
  registered?: string
  updated?: string
  totalStoreCredit?: number
  orderCount?: number
  [key: string]: unknown
}

function mapAddress(raw: RawEcwidAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.stateOrProvinceCode ?? raw.stateOrProvinceName ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? raw.countryName ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: RawEcwidCustomer): Customer {
  const billingAddr = mapAddress(raw.billingPerson)
  const shippingAddrs = (raw.shippingAddresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)
  const addresses: Address[] = []
  if (billingAddr) addresses.push(billingAddr)
  for (const sa of shippingAddrs) addresses.push(sa)

  const phone = raw.billingPerson?.phone ?? undefined

  // Ecwid may provide `name` or separate `firstName`/`lastName`
  let firstName = raw.firstName ?? undefined
  let lastName = raw.lastName ?? undefined
  if (!firstName && !lastName && raw.name) {
    const parts = raw.name.split(' ')
    firstName = parts[0]
    lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  }

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone,
    ordersCount: raw.orderCount,
    totalSpent:
      raw.totalStoreCredit != null
        ? { amount: majorToMinor(raw.totalStoreCredit, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress: billingAddr,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.registered,
    updatedAt: raw.updated,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['billingPerson'] = {
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      street: a.line1,
      city: a.city,
      stateOrProvinceCode: a.region,
      postalCode: a.postalCode,
      countryCode: a.country,
      phone: customer.phone,
    }
  }
  return body
}
