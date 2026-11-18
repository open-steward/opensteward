/**
 * BetterCommerce Customer → canonical Customer.
 *
 * BetterCommerce customer records live under `/api/v2/commerce/customer`.
 *
 * Field mapping:
 *  userId / recordId   → id
 *  email               → email
 *  firstName           → firstName
 *  lastName            → lastName
 *  phone / mobile      → phone
 *  isSubscribed        → acceptsMarketing
 *  address             → defaultAddress / addresses
 *  createdAt           → createdAt
 *  updatedAt           → updatedAt
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawBCAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postCode?: string | null
  country?: string | null
  countryCode?: string | null
  phoneNo?: string | null
  [key: string]: unknown
}

export interface RawBCCustomer {
  userId?: string
  recordId?: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  mobile?: string | null
  isSubscribed?: boolean
  isNewsletterSubscribed?: boolean
  address?: RawBCAddress | null
  addresses?: RawBCAddress[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawBCAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postCode ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawBCCustomer): Customer {
  const defaultAddr = mapAddress(raw.address)
  const extraAddrs = raw.addresses
    ?.map(mapAddress)
    .filter((a): a is Address => !!a)

  return {
    id: raw.userId ?? raw.recordId ?? '',
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? raw.mobile ?? undefined,
    acceptsMarketing: raw.isSubscribed ?? raw.isNewsletterSubscribed,
    defaultAddress: defaultAddr,
    addresses: extraAddrs && extraAddrs.length > 0 ? extraAddrs : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → BetterCommerce customer body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    isSubscribed: customer.acceptsMarketing,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.address = {
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.region,
      postCode: a.postalCode,
      countryCode: a.country,
    }
  }
  return body
}
