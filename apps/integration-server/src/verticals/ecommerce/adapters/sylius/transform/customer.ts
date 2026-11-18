/**
 * Sylius Customer -> canonical Customer.
 *
 * Sylius models customers as `/api/v2/admin/customers`. Each customer has
 * `email`, `firstName`, `lastName`, `phoneNumber`, and an optional
 * default address.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawSyliusAddress {
  id?: number | string
  firstName?: string
  lastName?: string
  street?: string
  city?: string
  provinceName?: string | null
  provinceCode?: string | null
  countryCode?: string | null
  postcode?: string | null
  phoneNumber?: string | null
  [key: string]: unknown
}

export interface RawSyliusCustomer {
  id: number | string
  email?: string
  emailCanonical?: string
  firstName?: string | null
  lastName?: string | null
  phoneNumber?: string | null
  gender?: string
  birthday?: string | null
  subscribedToNewsletter?: boolean
  defaultAddress?: RawSyliusAddress | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSyliusAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.provinceName ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: RawSyliusCustomer): Customer {
  const defaultAddr = mapAddress(raw.defaultAddress)
  const phone = raw.phoneNumber ?? raw.defaultAddress?.phoneNumber ?? undefined

  return {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: phone ?? undefined,
    acceptsMarketing: raw.subscribedToNewsletter,
    defaultAddress: defaultAddr,
    addresses: defaultAddr ? [defaultAddr] : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phoneNumber: customer.phone,
    subscribedToNewsletter: customer.acceptsMarketing,
  }
}
