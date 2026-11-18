/**
 * fabric Customer → canonical Customer.
 *
 * fabric customers endpoint: `GET /v3/customers`.
 * Each customer has `first_name`, `last_name`, `email`, `phone`,
 * `accepts_marketing`, `addresses`, `orders_count`, `total_spent`.
 */

import type { Customer } from '../../../schema/customer'
import { majorToMinor } from '../../../schema/shared'

export interface RawFabricAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  phone?: string
  [key: string]: unknown
}

export interface RawFabricCustomer {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  accepts_marketing?: boolean
  orders_count?: number
  total_spent?: number
  total_spent_currency?: string
  tags?: string[]
  default_address?: RawFabricAddress
  addresses?: RawFabricAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawFabricAddress | undefined | null) {
  if (!raw) return undefined
  if (!raw.line1 && !raw.city && !raw.postal_code && !raw.country) return undefined
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postal_code,
    country: raw.country,
  }
}

export function transformCustomer(raw: RawFabricCustomer): Customer {
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone,
    acceptsMarketing: raw.accepts_marketing,
    ordersCount: raw.orders_count,
    totalSpent:
      raw.total_spent != null
        ? { amount: majorToMinor(raw.total_spent, raw.total_spent_currency ?? 'USD'), currency: raw.total_spent_currency ?? 'USD' }
        : undefined,
    tags: raw.tags,
    defaultAddress: mapAddress(raw.default_address),
    addresses: raw.addresses?.map(mapAddress).filter(Boolean) as Customer['addresses'],
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  return {
    first_name: customer.firstName,
    last_name: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    accepts_marketing: customer.acceptsMarketing,
    tags: customer.tags,
  }
}
