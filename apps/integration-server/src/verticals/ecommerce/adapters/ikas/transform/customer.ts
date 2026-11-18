/**
 * ikas Customer → canonical Customer.
 *
 * ikas customer API fields (from listCustomer GraphQL query):
 *   id, email, firstName, lastName, phone, orderCount, totalOrderPrice,
 *   addresses (addressLine1/2, city, state, country, postalCode, isDefault),
 *   subscriptionStatus (email marketing), tagIds, createdAt, updatedAt
 *
 * Docs: https://ikas.dev/docs/api/admin-api/customers
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasCustomerAddressCountry {
  name?: string | null
  code?: string | null
  iso2?: string | null
  iso3?: string | null
}

export interface RawIkasCustomerAddressCity {
  name?: string | null
  code?: string | null
}

export interface RawIkasCustomerAddressState {
  name?: string | null
  code?: string | null
}

export interface RawIkasCustomerAddress {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: RawIkasCustomerAddressCity | null
  state?: RawIkasCustomerAddressState | null
  country?: RawIkasCustomerAddressCountry | null
  postalCode?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  company?: string | null
  isDefault?: boolean | null
  [key: string]: unknown
}

export interface RawIkasCustomer {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  orderCount?: number | null
  totalOrderPrice?: number | null
  /** Email marketing subscription: SUBSCRIBED | UNSUBSCRIBED | NOT_SUBSCRIBED */
  subscriptionStatus?: string | null
  tagIds?: string[] | null
  addresses?: RawIkasCustomerAddress[] | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawIkasCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? undefined
  const city = raw.city?.name ?? undefined
  const country =
    raw.country?.iso2 ?? raw.country?.code ?? raw.country?.name ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.addressLine2 ?? undefined,
    city,
    region: raw.state?.name ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawIkasCustomer): Customer {
  const defaultAddr = raw.addresses?.find((a) => a.isDefault) ?? raw.addresses?.[0]
  const allAddresses = (raw.addresses ?? [])
    .map((a) => mapAddress(a))
    .filter((a): a is Address => a != null)

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.subscriptionStatus === 'SUBSCRIBED',
    ordersCount: raw.orderCount ?? undefined,
    totalSpent:
      raw.totalOrderPrice != null && raw.totalOrderPrice >= 0
        ? { amount: majorToMinor(raw.totalOrderPrice, 'TRY'), currency: 'TRY' }
        : undefined,
    defaultAddress: mapAddress(defaultAddr),
    addresses: allAddresses.length > 0 ? allAddresses : undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → ikas customer input. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    subscriptionStatus: customer.acceptsMarketing ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.addresses = [
      {
        addressLine1: a.line1,
        addressLine2: a.line2,
        postalCode: a.postalCode,
        isDefault: true,
      },
    ]
  }
  return body
}
