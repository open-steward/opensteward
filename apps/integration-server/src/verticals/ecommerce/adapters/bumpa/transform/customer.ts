/**
 * Bumpa Customer → canonical Customer.
 *
 * Bumpa customer records returned from GET /v1/customers use snake_case
 * field names. The customer address is stored as a flat object.
 * Total spent is reported as a decimal major-unit string.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Bumpa shape ───────────────────────────────────────────────────────────

export interface RawBumpaAddress {
  address?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface RawBumpaCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  phone?: string | null
  phone_number?: string | null
  accepts_marketing?: boolean
  orders_count?: number
  total_spent?: string | number
  currency?: string
  tags?: string | string[] | null
  address?: RawBumpaAddress | null
  default_address?: RawBumpaAddress | null
  addresses?: RawBumpaAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawBumpaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? raw.address ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? undefined
  const postalCode = raw.postal_code ?? raw.zip ?? undefined
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

function parseTags(tags: string | string[] | null | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.filter((t) => t.length > 0)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/**
 * Split a full display name into first/last name parts when the API only
 * provides a combined `name` field.
 */
function splitName(name: string | null | undefined): { first?: string; last?: string } {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0] }
  const last = parts.pop()
  return { first: parts.join(' '), last }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawBumpaCustomer): Customer {
  const currency = (raw.currency as string | undefined) ?? 'NGN'
  const totalSpentNum =
    typeof raw.total_spent === 'string' ? parseFloat(raw.total_spent) : raw.total_spent

  const nameParts = splitName(raw.name as string | null | undefined)
  const firstName = (raw.first_name as string | null | undefined) ?? nameParts.first ?? undefined
  const lastName = (raw.last_name as string | null | undefined) ?? nameParts.last ?? undefined

  const phone = (raw.phone ?? raw.phone_number) as string | null | undefined

  const defaultAddr = mapAddress(
    (raw.default_address ?? raw.address) as RawBumpaAddress | null | undefined,
  )
  const allAddrs = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => !!a)

  return {
    id: String(raw.id),
    email: (raw.email as string | null | undefined) ?? undefined,
    firstName,
    lastName,
    phone: phone ?? undefined,
    acceptsMarketing: raw.accepts_marketing,
    ordersCount: raw.orders_count,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? { amount: majorToMinor(totalSpentNum, currency), currency }
        : undefined,
    tags: parseTags(raw.tags as string | string[] | null | undefined),
    defaultAddress: defaultAddr,
    addresses: allAddrs.length > 0 ? allAddrs : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Bumpa customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    accepts_marketing: customer.acceptsMarketing,
  }
  if (customer.tags) body['tags'] = customer.tags.join(',')
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['address'] = {
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.region,
      postal_code: a.postalCode,
      country: a.country,
    }
  }
  return body
}
