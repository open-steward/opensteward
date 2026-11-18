/**
 * JTL-Shop Customer (Kunde) → canonical Customer.
 *
 * JTL-Shop customers are available under `/api/v1/customers`. Key fields:
 *  - `id`, `email`, `firstName`, `lastName`, `phone`
 *  - `acceptsMarketing` boolean
 *  - `ordersCount` (total number of orders placed)
 *  - `totalSpent` (decimal gross amount in shop currency)
 *  - `currency` (ISO 4217)
 *  - `billingAddress` / `addresses` array
 *  - `tags` array of strings
 *  - `created`, `modified` — ISO 8601 timestamps
 *  - `active` boolean (account enabled)
 *
 * totalSpent is a decimal major-unit value; canonical Money is minor units.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopCustomerAddress {
  street?: string | null
  streetNumber?: string | null
  addressSupplement?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
  company?: string | null
  [key: string]: unknown
}

export interface RawJtlShopCustomer {
  id: number | string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  acceptsMarketing?: boolean
  ordersCount?: number | null
  /** Decimal gross total spent in shop currency */
  totalSpent?: number | string | null
  currency?: string | null
  tags?: string[] | null
  billingAddress?: RawJtlShopCustomerAddress | null
  addresses?: RawJtlShopCustomerAddress[]
  active?: boolean
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawJtlShopCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const streetParts = [raw.street, raw.streetNumber].filter(Boolean)
  const line1 = streetParts.length > 0 ? streetParts.join(' ') : undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.addressSupplement ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawJtlShopCustomer): Customer {
  const currency = raw.currency ?? 'EUR'
  const totalSpentNum =
    raw.totalSpent != null
      ? typeof raw.totalSpent === 'string'
        ? parseFloat(raw.totalSpent)
        : raw.totalSpent
      : null

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.acceptsMarketing,
    ordersCount: raw.ordersCount ?? undefined,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? { amount: majorToMinor(totalSpentNum, currency), currency }
        : undefined,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : undefined,
    defaultAddress: mapAddress(raw.billingAddress),
    addresses: raw.addresses
      ?.map((a) => mapAddress(a))
      .filter((a): a is Address => !!a),
    createdAt: raw.created ?? undefined,
    updatedAt: raw.modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → JTL-Shop customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    acceptsMarketing: customer.acceptsMarketing,
  }
  if (customer.tags?.length) {
    body['tags'] = customer.tags
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['billingAddress'] = {
      street: a.line1,
      addressSupplement: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      countryCode: a.country,
    }
  }
  return body
}
