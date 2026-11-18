/**
 * Shoper User → canonical Customer.
 *
 * Shoper refers to customers as "users" in the API:
 *   GET /webapi/rest/users[/{id}]
 *
 * The user record contains personal details, address, and aggregate
 * order statistics.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperAddress {
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  street?: string | null
  apartment?: string | null
  postcode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawShoperUser {
  user_id: number | string
  email?: string | null
  login?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  newsletter?: boolean | number | null
  /** Number of orders placed by this user. */
  orders_count?: number | null
  /** Address details for the user. */
  address?: RawShoperAddress | null
  /** Additional addresses. */
  addresses?: RawShoperAddress[]
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawShoperAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const line2 = raw.apartment ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawShoperUser): Customer {
  const defaultAddress = mapAddress(raw.address)
  const extraAddresses = (raw.addresses ?? [])
    .map((a) => mapAddress(a))
    .filter((a): a is Address => !!a)

  return {
    id: String(raw.user_id),
    email: raw.email ?? undefined,
    firstName: raw.firstname ?? undefined,
    lastName: raw.lastname ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.newsletter != null ? Boolean(raw.newsletter) : undefined,
    ordersCount: raw.orders_count ?? undefined,
    totalSpent: undefined,
    tags: undefined,
    defaultAddress,
    addresses: extraAddresses.length > 0 ? extraAddresses : undefined,
    createdAt: raw.add_date ?? undefined,
    updatedAt: raw.edit_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Shoper user body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    phone: customer.phone,
    newsletter: customer.acceptsMarketing != null ? (customer.acceptsMarketing ? 1 : 0) : undefined,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['address'] = {
      street: a.line1,
      apartment: a.line2,
      city: a.city,
      postcode: a.postalCode,
      state: a.region,
      country_code: a.country,
    }
  }
  return body
}
