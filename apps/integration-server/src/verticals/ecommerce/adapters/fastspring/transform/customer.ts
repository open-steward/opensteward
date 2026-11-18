/**
 * FastSpring Account → canonical Customer.
 *
 * Docs:
 *  - https://developer.fastspring.com/reference/create-an-account
 *  - https://developer.fastspring.com/reference/retrieve-an-account
 *  - https://developer.fastspring.com/reference/update-an-account
 *
 * FastSpring has no `total_spent` on the account object — computing it
 * would require summing every order, which the adapter's per-account GET
 * does not do. `totalSpent` is left undefined rather than approximated.
 */

import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

/**
 * FastSpring documents `country` as ISO 3166-1 alpha-2 already, but guard
 * against an unassigned/garbage value reaching the strict canonical
 * `Address.country` (`Iso3166Alpha2`) — better to drop the field than fail
 * the whole transform.
 */
function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase()
  return isIso3166Alpha2(upper) ? upper : undefined
}

export interface RawFastSpringAccountContact {
  first?: string
  last?: string
  email?: string
  company?: string
  phone?: string
  subscribed?: boolean
}

export interface RawFastSpringAccountAddress {
  addressLine1?: string
  addressLine2?: string
  city?: string
  region?: string
  postalCode?: string
  company?: string
}

export interface RawFastSpringAccount {
  /**
   * The documented account identifier. Every retrieve/create response
   * example shows it (redundantly alongside `id`, which echoes the same
   * value) — see the docs cited above — so it's required here rather than
   * chained with a fallback.
   */
  account: string
  /** Redundant echo of `account` some responses also carry. Never read as a fallback for `account`. */
  id?: string
  contact?: RawFastSpringAccountContact
  address?: RawFastSpringAccountAddress
  language?: string
  country?: string
  lookup?: { global?: string; custom?: string }
  orders?: string[]
  subscriptions?: string[]
  subscribed?: boolean
  [key: string]: unknown
}

function mapAddress(
  raw: RawFastSpringAccountAddress | undefined,
  country: string | undefined,
): Address | undefined {
  if (!raw) return undefined
  const { addressLine1: line1, addressLine2: line2, city, region, postalCode } = raw
  const normalizedCountry = normalizeCountry(country)
  if (!line1 && !city && !postalCode && !normalizedCountry) return undefined
  return { line1, line2, city, region, postalCode, country: normalizedCountry }
}

export function transformCustomer(raw: RawFastSpringAccount): Customer {
  if (!raw.account) {
    throw new Error('FastSpring account response is missing "account" — cannot map to a Customer.')
  }
  const address = mapAddress(raw.address, raw.country)

  return {
    id: raw.account,
    email: raw.contact?.email,
    firstName: raw.contact?.first,
    lastName: raw.contact?.last,
    phone: raw.contact?.phone,
    acceptsMarketing: raw.contact?.subscribed ?? raw.subscribed,
    ordersCount: raw.orders?.length,
    defaultAddress: address,
    addresses: address ? [address] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Customer → FastSpring account body (`POST /accounts` create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contact: {
      first: customer.firstName,
      last: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    },
  }
  const country = customer.defaultAddress?.country
  if (country) body['country'] = country
  return body
}
