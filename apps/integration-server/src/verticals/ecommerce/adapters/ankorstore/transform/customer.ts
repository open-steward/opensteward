/**
 * WooCommerce Customer → canonical Customer.
 *
 * WC exposes billing + shipping as two sub-objects that already match the
 * canonical AddressSchema shape closely (line1 / city / postal / country).
 * `orders_count` and `total_spent` map directly.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawWooCommerceAddress {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawWooCommerceCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  role?: string
  billing?: RawWooCommerceAddress | null
  shipping?: RawWooCommerceAddress | null
  is_paying_customer?: boolean
  orders_count?: number
  total_spent?: string | number
  date_created?: string
  date_created_gmt?: string
  date_modified?: string
  date_modified_gmt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawWooCommerceAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const line2 = raw.address_2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawWooCommerceCustomer): Customer {
  const totalSpentNum =
    typeof raw.total_spent === 'string'
      ? parseFloat(raw.total_spent)
      : raw.total_spent
  const billing = mapAddress(raw.billing)
  const shipping = mapAddress(raw.shipping)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping && shipping !== billing) addresses.push(shipping)

  // WC customer phone lives on billing.
  const phone = raw.billing?.phone ?? undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone,
    ordersCount: raw.orders_count,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? { amount: majorToMinor(totalSpentNum, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    updatedAt: raw.date_modified_gmt ?? raw.date_modified,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['billing'] = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      address_1: a.line1,
      address_2: a.line2,
      city: a.city,
      state: a.region,
      postcode: a.postalCode,
      country: a.country,
      email: customer.email,
      phone: customer.phone,
    }
    body['shipping'] = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      address_1: a.line1,
      address_2: a.line2,
      city: a.city,
      state: a.region,
      postcode: a.postalCode,
      country: a.country,
    }
  }
  return body
}
