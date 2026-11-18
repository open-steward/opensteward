/**
 * Webflow Order customer info → canonical Customer.
 *
 * Webflow does not have a standalone customers API — customer data is
 * extracted from order `customerInfo` and billing/shipping addresses.
 * The adapter synthesises a customer id from the email address.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawWebflowCustomer {
  _id?: string
  email?: string
  name?: string
  fullName?: string
  firstName?: string
  lastName?: string
  phone?: string
  acceptsMarketing?: boolean
  ordersCount?: number
  totalSpent?: number
  currency?: string
  billingAddress?: RawWebflowCustomerAddress | null
  shippingAddress?: RawWebflowCustomerAddress | null
  createdOn?: string
  lastUpdated?: string
  [key: string]: unknown
}

export interface RawWebflowCustomerAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

function mapAddress(raw: RawWebflowCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.line2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function splitName(name: string | undefined): { first?: string; last?: string } {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function transformCustomer(raw: RawWebflowCustomer): Customer {
  const { first, last } = splitName(raw.fullName ?? raw.name)
  return {
    id: raw._id ?? raw.email ?? '',
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? first,
    lastName: raw.lastName ?? last,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.acceptsMarketing,
    ordersCount: raw.ordersCount,
    totalSpent:
      raw.totalSpent != null
        ? { amount: raw.totalSpent, currency: raw.currency ?? 'USD' }
        : undefined,
    defaultAddress: mapAddress(raw.billingAddress ?? raw.shippingAddress),
    addresses: [
      mapAddress(raw.billingAddress),
      mapAddress(raw.shippingAddress),
    ].filter((a): a is Address => !!a),
    createdAt: raw.createdOn,
    updatedAt: raw.lastUpdated,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
    phone: customer.phone,
    acceptsMarketing: customer.acceptsMarketing,
  }
}
