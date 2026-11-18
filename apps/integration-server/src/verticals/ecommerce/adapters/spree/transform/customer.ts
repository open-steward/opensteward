/**
 * Spree User → canonical Customer.
 *
 * Spree models customers as "users" under `/api/v2/platform/users`.
 * Users have `email`, optional name fields via `bill_address` /
 * `ship_address`, and order history stats.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawSpreeAddress {
  id?: number | string
  firstname?: string | null
  lastname?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state_name?: string | null
  state_id?: number | string | null
  country_iso?: string | null
  zipcode?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawSpreeUser {
  id: number | string
  email?: string
  first_name?: string | null
  last_name?: string | null
  created_at?: string
  updated_at?: string
  bill_address?: RawSpreeAddress | null
  ship_address?: RawSpreeAddress | null
  completed_orders?: number
  total_spent?: string | number | null
  average_order_value?: string | number | null
  store_credits?: string | number | null
  [key: string]: unknown
}

function mapAddress(raw: RawSpreeAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state_name ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country_iso ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawSpreeUser): Customer {
  const defaultAddr = mapAddress(raw.bill_address) ?? mapAddress(raw.ship_address)
  const addresses = [mapAddress(raw.bill_address), mapAddress(raw.ship_address)].filter(
    (a): a is Address => a != null,
  )
  const phone = raw.bill_address?.phone ?? raw.ship_address?.phone ?? undefined
  const firstName =
    raw.first_name ?? raw.bill_address?.firstname ?? undefined
  const lastName =
    raw.last_name ?? raw.bill_address?.lastname ?? undefined

  return {
    id: String(raw.id),
    email: raw.email,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
    phone: phone ?? undefined,
    ordersCount: raw.completed_orders,
    defaultAddress: defaultAddr,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    user: {
      email: customer.email,
      first_name: customer.firstName,
      last_name: customer.lastName,
    },
  }
}
