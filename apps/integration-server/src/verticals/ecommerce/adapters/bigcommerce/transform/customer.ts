/**
 * BigCommerce Customer → canonical Customer.
 *
 * BigCommerce v3 Customers API returns customers with nested `addresses`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawBigCommerceAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  state_or_province?: string | null
  postal_code?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawBigCommerceCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  accepts_product_review_abandoned_cart_emails?: boolean
  store_credit_amounts?: Array<{ amount?: number }>
  date_created?: string
  date_modified?: string
  addresses?: RawBigCommerceAddress[]
  [key: string]: unknown
}

function mapAddress(raw: RawBigCommerceAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state_or_province ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawBigCommerceCustomer): Customer {
  const addresses = (raw.addresses ?? [])
    .map((a) => mapAddress(a))
    .filter((a): a is Address => !!a)

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.accepts_product_review_abandoned_cart_emails,
    defaultAddress: addresses[0],
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.date_created,
    updatedAt: raw.date_modified,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.addresses = [
      {
        address1: a.line1,
        address2: a.line2,
        city: a.city,
        state_or_province: a.region,
        postal_code: a.postalCode,
        country_code: a.country,
      },
    ]
  }
  return body
}
