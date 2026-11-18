/**
 * Lemon Squeezy Customer → canonical Customer.
 *
 * LS customer attributes include name (full name), email, city, region,
 * country, and aggregate revenue figures (already in cents).
 *
 * Docs: https://docs.lemonsqueezy.com/api/customers/the-customer-object
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import type { LsResource } from '../client'

// ── Raw Lemon Squeezy attribute shape ─────────────────────────────────────────

export interface RawLsCustomerAttributes {
  store_id: number
  name: string
  email: string
  status: string              // "subscribed" | "unsubscribed" | "archived"
  city?: string | null
  region?: string | null
  country: string             // ISO 3166-1 alpha-2
  total_revenue_currency: number   // cents
  mrr: number                      // cents
  status_formatted?: string
  country_formatted?: string
  total_revenue_currency_formatted?: string
  mrr_formatted?: string
  urls?: { customer_portal?: string }
  created_at: string
  updated_at: string
  test_mode?: boolean
  [key: string]: unknown
}

export type RawLsCustomer = LsResource<RawLsCustomerAttributes>

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = (name ?? '').trim().split(/\s+/)
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  const last = parts.pop()!
  return { firstName: parts.join(' '), lastName: last }
}

function buildAddress(attrs: RawLsCustomerAttributes): Address | undefined {
  const city = attrs.city ?? undefined
  const region = attrs.region ?? undefined
  const country = attrs.country || undefined
  if (!city && !region && !country) return undefined
  return { city, region, country }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawLsCustomer): Customer {
  const attrs = raw.attributes
  const { firstName, lastName } = splitName(attrs.name)
  const address = buildAddress(attrs)
  return {
    id: raw.id,
    email: attrs.email || undefined,
    firstName,
    lastName,
    totalSpent:
      attrs.total_revenue_currency != null
        ? { amount: attrs.total_revenue_currency, currency: 'USD' }
        : undefined,
    defaultAddress: address,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const nameParts = [customer.firstName, customer.lastName].filter(Boolean)
  return {
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: customer.email,
    city: customer.defaultAddress?.city,
    region: customer.defaultAddress?.region,
    country: customer.defaultAddress?.country,
  }
}
