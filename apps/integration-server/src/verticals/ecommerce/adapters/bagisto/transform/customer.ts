/**
 * Bagisto Customer → canonical Customer.
 *
 * Bagisto exposes a customer profile with nested `addresses[]` array. The
 * first address marked as `default_address: true` (or the first in the list)
 * is mapped to `defaultAddress`. All addresses are mapped.
 *
 * Bagisto does not expose `orders_count` or `total_spent` on the customer
 * object directly — those fields are omitted.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Bagisto shapes ────────────────────────────────────────────────────────

export interface BagistoCustomerAddress {
  id?: number | string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  address1?: string | string[] | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  phone?: string | null
  default_address?: boolean
  [key: string]: unknown
}

export interface BagistoCustomer {
  id: number | string
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  gender?: string | null
  date_of_birth?: string | null
  created_at?: string | null
  updated_at?: string | null
  addresses?: BagistoCustomerAddress[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAddress1(raw: BagistoCustomerAddress): string | undefined {
  const a = raw.address1
  if (!a) return undefined
  if (Array.isArray(a)) return a.filter(Boolean).join(', ') || undefined
  return a || undefined
}

function mapAddress(raw: BagistoCustomerAddress): Address | undefined {
  const line1 = resolveAddress1(raw)
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: BagistoCustomer): Customer {
  const addresses: Address[] = []
  let defaultAddress: Address | undefined

  for (const addr of raw.addresses ?? []) {
    const mapped = mapAddress(addr)
    if (!mapped) continue
    if (addr.default_address && !defaultAddress) {
      defaultAddress = mapped
    }
    addresses.push(mapped)
  }

  // Fall back to first valid address as default if none is flagged.
  if (!defaultAddress && addresses.length > 0) {
    defaultAddress = addresses[0]
  }

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Customer → Bagisto customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    first_name: customer.firstName,
    last_name: customer.lastName,
    email: customer.email,
    phone: customer.phone,
  }
}
