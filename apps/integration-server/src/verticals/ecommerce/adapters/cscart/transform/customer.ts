/**
 * CS-Cart User → canonical Customer.
 *
 * CS-Cart users (`/api/users`) carry billing and shipping address fields
 * inline with a `b_` / `s_` prefix (same convention as orders). The
 * `orders_count` and `purchase_value` fields map to `ordersCount` /
 * `totalSpent`. The user `status` (`A` = Active) is informational.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw CS-Cart shape ────────────────────────────────────────────────────────

export interface CsCartUser {
  user_id: number | string
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  status?: string
  // Billing
  b_address?: string | null
  b_address_2?: string | null
  b_city?: string | null
  b_state?: string | null
  b_zipcode?: string | null
  b_country?: string | null
  // Shipping
  s_address?: string | null
  s_address_2?: string | null
  s_city?: string | null
  s_state?: string | null
  s_zipcode?: string | null
  s_country?: string | null
  // Stats
  orders_count?: number | string
  purchase_value?: string | number | null
  timestamp?: number | string
  last_login?: number | string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(
  prefix: 'b' | 's',
  raw: CsCartUser,
): Address | undefined {
  const line1 = raw[`${prefix}_address`] as string | null | undefined
  const line2 = raw[`${prefix}_address_2`] as string | null | undefined
  const city = raw[`${prefix}_city`] as string | null | undefined
  const region = raw[`${prefix}_state`] as string | null | undefined
  const postalCode = raw[`${prefix}_zipcode`] as string | null | undefined
  const country = raw[`${prefix}_country`] as string | null | undefined

  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1: line1 ?? undefined,
    line2: line2 ?? undefined,
    city: city ?? undefined,
    region: region ?? undefined,
    postalCode: postalCode ?? undefined,
    country: country ?? undefined,
  }
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function transformCustomer(raw: CsCartUser): Customer {
  const billing = mapAddress('b', raw)
  const shipping = mapAddress('s', raw)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping) addresses.push(shipping)

  const spent =
    raw.purchase_value != null
      ? typeof raw.purchase_value === 'string'
        ? parseFloat(raw.purchase_value)
        : raw.purchase_value
      : undefined

  return {
    id: String(raw.user_id),
    email: raw.email ?? undefined,
    firstName: raw.firstname ?? undefined,
    lastName: raw.lastname ?? undefined,
    phone: raw.phone ?? undefined,
    ordersCount:
      raw.orders_count != null ? Number(raw.orders_count) : undefined,
    totalSpent:
      spent != null && !Number.isNaN(spent)
        ? { amount: majorToMinor(spent, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: tsToIso(raw.timestamp),
    updatedAt: tsToIso(raw.last_login),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Customer → CS-Cart user body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['b_address'] = a.line1
    body['b_address_2'] = a.line2
    body['b_city'] = a.city
    body['b_state'] = a.region
    body['b_zipcode'] = a.postalCode
    body['b_country'] = a.country
    body['s_address'] = a.line1
    body['s_address_2'] = a.line2
    body['s_city'] = a.city
    body['s_state'] = a.region
    body['s_zipcode'] = a.postalCode
    body['s_country'] = a.country
  }
  return body
}
