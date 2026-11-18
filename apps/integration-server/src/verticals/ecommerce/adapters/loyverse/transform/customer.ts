/**
 * Loyverse Customer → canonical Customer.
 *
 * Loyverse uses a single `name` field (not first_name/last_name). We split
 * on the first space as a best-effort decomposition. The API also exposes
 * `phone_number` (not `phone`), `address`, `city`, `region`, `postal_code`,
 * and `country_code` as flat top-level fields rather than nested address
 * objects.
 *
 * `total_spent` is reported in major currency units as a decimal number.
 * `total_points` tracks the loyalty points balance.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawLoyverseCustomer {
  id: string
  name?: string | null
  email?: string | null
  phone_number?: string | null
  address?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country_code?: string | null
  customer_code?: string | null
  note?: string | null
  first_visit?: string | null
  last_visit?: string | null
  total_visits?: number
  /** Total amount spent in major units (e.g. 149.99). */
  total_spent?: number
  total_points?: number
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

function splitName(name: string | null | undefined): { first?: string; last?: string } {
  if (!name) return {}
  const trimmed = name.trim()
  if (!trimmed) return {}
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { first: trimmed }
  return {
    first: trimmed.slice(0, spaceIdx),
    last: trimmed.slice(spaceIdx + 1),
  }
}

function mapAddress(raw: RawLoyverseCustomer): Address | undefined {
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: RawLoyverseCustomer): Customer {
  const { first, last } = splitName(raw.name)

  // Loyverse reports total_spent in major units (decimal). Convert to minor units.
  // Currency is not directly reported on the customer object; we leave it as
  // 'USD' as a safe default since Loyverse is POS-focused and currency is
  // configured per-store (not per-customer).
  const totalSpent =
    raw.total_spent != null
      ? { amount: majorToMinor(raw.total_spent, 'USD'), currency: 'USD' }
      : undefined

  const address = mapAddress(raw)

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: first,
    lastName: last,
    phone: raw.phone_number ?? undefined,
    totalSpent,
    defaultAddress: address,
    addresses: address ? [address] : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Loyverse customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const nameParts = [customer.firstName, customer.lastName].filter(Boolean)
  const body: Record<string, unknown> = {
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: customer.email,
    phone_number: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.address = a.line1
    body.city = a.city
    body.region = a.region
    body.postal_code = a.postalCode
    body.country_code = a.country
  }
  return body
}
