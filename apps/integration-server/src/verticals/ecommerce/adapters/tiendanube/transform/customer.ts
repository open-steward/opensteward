/**
 * Tiendanube / Nuvemshop Customer → canonical Customer.
 *
 * Key differences from Shopify:
 *  - `name` is a single full-name field (not split into first/last). We
 *    split on the first space: "Maria Silva" → firstName="Maria", lastName="Silva".
 *  - Default address uses Tiendanube's flat address shape (street, number,
 *    floor, locality, city, province, zipcode, country).
 *  - `total_spent` and `total_spent_currency` are separate fields.
 *  - `accepts_marketing` is present (read-only from the API).
 *  - No `tags` field on customers.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/customer
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeAddress {
  id?: number | string
  address?: string | null
  number?: string | null
  floor?: string | null
  locality?: string | null
  city?: string | null
  province?: string | null
  zipcode?: string | null
  country?: string | null
  phone?: string | null
  default?: boolean
  [key: string]: unknown
}

export interface RawTiendanubeCustomer {
  id: number | string
  name?: string | null
  email?: string | null
  phone?: string | null
  identification?: string | null
  note?: string | null
  default_address?: RawTiendanubeAddress | null
  addresses?: RawTiendanubeAddress[]
  total_spent?: string | number
  total_spent_currency?: string
  last_order_id?: number | string | null
  active?: boolean
  accepts_marketing?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitName(name: string | null | undefined): {
  firstName: string | undefined
  lastName: string | undefined
} {
  if (!name) return { firstName: undefined, lastName: undefined }
  const idx = name.indexOf(' ')
  if (idx === -1) return { firstName: name, lastName: undefined }
  return {
    firstName: name.slice(0, idx),
    lastName: name.slice(idx + 1),
  }
}

function mapAddress(raw: RawTiendanubeAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.address ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  if (!street && !city && !postalCode && !country) return undefined
  return {
    line1: [street, raw.number].filter(Boolean).join(' ') || undefined,
    line2: [raw.floor, raw.locality].filter(Boolean).join(', ') || undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawTiendanubeCustomer): Customer {
  const { firstName, lastName } = splitName(raw.name)
  const currency = raw.total_spent_currency ?? 'USD'
  const totalSpentNum =
    typeof raw.total_spent === 'string' ? parseFloat(raw.total_spent) : raw.total_spent

  const defaultAddress = mapAddress(raw.default_address)
  const addresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => !!a)

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.accepts_marketing,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? {
            amount: majorToMinor(totalSpentNum, currency),
            currency,
          }
        : undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined
  const body: Record<string, unknown> = {
    name,
    email: customer.email,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.default_address = {
      address: a.line1,
      city: a.city,
      province: a.region,
      zipcode: a.postalCode,
      country: a.country,
    }
  }
  return body
}
