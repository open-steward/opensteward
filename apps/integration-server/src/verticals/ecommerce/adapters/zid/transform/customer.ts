/**
 * Zid Customer → canonical Customer.
 *
 * Zid's /v1/managers/store/customers endpoint returns customers with a single
 * `name` field (not split first/last), an `email`, `mobile`, and a `city`
 * object. Total spend is in `order_total_payments` (decimal major-unit SAR).
 *
 * Pagination uses `next_cursor` for cursor-based or `page`/`per_page` for
 * offset-based listing — both are handled in the client.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Zid shape ────────────────────────────────────────────────────────────

export interface RawZidCity {
  name?: string
  en_name?: string
  ar_name?: string
  country_code?: string
  country_name?: string
  [key: string]: unknown
}

export interface RawZidCustomer {
  id?: number | string
  name?: string | null
  email?: string | null
  mobile?: string | null
  gender?: string | null
  birth_date?: string | null
  verified?: boolean
  is_active?: boolean
  type?: string | null // "individual" | "business"
  business_name?: string | null
  order_counts?: number | null
  order_total_payments?: number | string | null
  last_order_date?: string | null
  created_at?: string
  updated_at?: string
  city?: RawZidCity | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitName(name: string | null | undefined): { first?: string; last?: string } {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function mapCityToAddress(city: RawZidCity | null | undefined): Address | undefined {
  if (!city) return undefined
  const cityName = city.en_name ?? city.name ?? undefined
  const country = city.country_code ?? undefined
  if (!cityName && !country) return undefined
  return { city: cityName, country }
}

function toNum(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawZidCustomer): Customer {
  const { first: firstName, last: lastName } = splitName(raw.name)
  const totalSpent = toNum(raw.order_total_payments)

  return {
    id: String(raw.id ?? ''),
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone: raw.mobile ?? undefined,
    acceptsMarketing: undefined, // Zid does not expose this flag
    ordersCount: raw.order_counts ?? undefined,
    totalSpent:
      totalSpent != null
        ? { amount: majorToMinor(totalSpent, 'SAR'), currency: 'SAR' }
        : undefined,
    defaultAddress: mapCityToAddress(raw.city),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Zid customer create/update body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const nameParts = [customer.firstName, customer.lastName].filter(Boolean)
  return {
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: customer.email,
    mobile: customer.phone,
  }
}
