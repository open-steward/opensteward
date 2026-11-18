/**
 * X-Cart Customer (Profile) → canonical Customer.
 *
 * X-Cart calls customers "profiles" internally. The REST endpoint is
 * `GET /api/profiles`. Each profile has billing and shipping address
 * sub-objects. `orders_count` and `total_spent` may not always be present
 * depending on X-Cart version / API configuration.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw X-Cart shapes ────────────────────────────────────────────────────────

export interface XCartProfileAddress {
  firstname?: string | null
  lastname?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface XCartProfile {
  profile_id: number | string
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  orders_count?: number | null
  total_spent?: number | null
  billing_address?: XCartProfileAddress | null
  shipping_address?: XCartProfileAddress | null
  created?: number | null
  modified?: number | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: XCartProfileAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: XCartProfile): Customer {
  const billing = mapAddress(raw.billing_address)
  const shipping = mapAddress(raw.shipping_address)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping) addresses.push(shipping)

  const createdAt =
    raw.created != null ? new Date(raw.created * 1000).toISOString() : undefined
  const updatedAt =
    raw.modified != null ? new Date(raw.modified * 1000).toISOString() : undefined

  return {
    id: String(raw.profile_id),
    email: raw.email ?? undefined,
    firstName: raw.firstname ?? undefined,
    lastName: raw.lastname ?? undefined,
    phone: raw.phone ?? raw.billing_address?.phone ?? undefined,
    ordersCount: raw.orders_count ?? undefined,
    totalSpent:
      raw.total_spent != null
        ? { amount: majorToMinor(raw.total_spent, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt,
    updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}
