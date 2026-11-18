/**
 * Squarespace Profile → canonical Customer.
 *
 * Squarespace calls customers "profiles". They are listed by
 * `GET /1.0/profiles` and read by `GET /1.0/profiles/{profileIdCsvs}`, both
 * returning `{ profiles: Profile[] }` (the list adds `pagination`).
 *
 * Docs: https://developers.squarespace.com/commerce-apis/profiles
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawSquarespaceAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  countryCode?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export interface RawSquarespaceProfile {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  acceptsMarketing?: boolean
  hasAccount?: boolean
  isCustomer?: boolean
  /** TransactionsSummary; `orderCount` is the "Count of orders submitted." */
  transactionsSummary?: { orderCount?: number; [key: string]: unknown } | null
  createdOn?: string
  address?: RawSquarespaceAddress | null
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapAddress(raw: RawSquarespaceAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawSquarespaceProfile): Customer {
  const addr = mapAddress(raw.address)
  return {
    id: raw.id,
    email: raw.email || undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    acceptsMarketing: raw.acceptsMarketing,
    ordersCount:
      typeof raw.transactionsSummary?.orderCount === 'number'
        ? raw.transactionsSummary.orderCount
        : undefined,
    defaultAddress: addr,
    addresses: addr ? [addr] : undefined,
    createdAt: raw.createdOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.email !== undefined) body.email = customer.email
  if (customer.firstName !== undefined) body.firstName = customer.firstName
  if (customer.lastName !== undefined) body.lastName = customer.lastName
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.address = {
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.region,
      postalCode: a.postalCode,
      countryCode: a.country,
    }
  }
  return body
}
