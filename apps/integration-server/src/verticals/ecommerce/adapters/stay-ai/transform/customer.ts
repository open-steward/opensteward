/**
 * Stay AI Account/Customer → canonical Customer.
 *
 * Stay AI exposes customer data via the account-settings endpoint and
 * indirectly through subscription records (email, phone, shipping address).
 * We synthesise a Customer from the data available.
 *
 * Docs: https://docs.stay.ai/reference/query-account-settings
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Stay AI shapes ────────────────────────────────────────────────────────

export interface RawStayAiCustomer {
  id?: number | string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  /** Number of active subscriptions. */
  activeSubscriptions?: number | null
  defaultAddress?: RawStayAiCustomerAddress | null
  createdAt?: number | string | null
  updatedAt?: number | string | null
  [key: string]: unknown
}

export interface RawStayAiCustomerAddress {
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  provinceCode?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
  phone?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return new Date(v).toISOString()
  const s = String(v).trim()
  if (!s) return undefined
  const parsed = Date.parse(s)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function mapAddress(raw: RawStayAiCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.province ?? raw.provinceCode ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawStayAiCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    ordersCount: typeof raw.activeSubscriptions === 'number' ? raw.activeSubscriptions : undefined,
    defaultAddress: mapAddress(raw.defaultAddress),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
