/**
 * Bagy Customer → canonical Customer.
 *
 * Key Bagy customer fields:
 *  - `id`, `name` (full name), `email`, `cpf`, `cnpj`, `phone`, `cellphone`
 *  - `Customer.address` / `CustomerAddress[]` for addresses
 *  - `modified` / `created` timestamps
 *
 * Bagy does not track `total_spent` or `orders_count` on the customer object
 * in the REST API — those are omitted.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Bagy shapes ──────────────────────────────────────────────────────────

export interface RawBagyCustomerAddress {
  address?: string | null
  complement?: string | null
  quarter?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawBagyCustomer {
  id: number | string
  name?: string | null
  email?: string | null
  cpf?: string | null
  cnpj?: string | null
  phone?: string | null
  cellphone?: string | null
  newsletter?: number | string | boolean | null
  CustomerAddress?: RawBagyCustomerAddress[]
  modified?: string | null
  created?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawBagyCustomerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const line2 = raw.complement ?? raw.quarter ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? 'BR'
  if (!line1 && !city && !postalCode) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function splitName(fullName: string | null | undefined): { first?: string; last?: string } {
  if (!fullName) return {}
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return {}
  const first = parts[0]
  const last = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  return { first, last }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawBagyCustomer): Customer {
  const { first, last } = splitName(raw.name)
  const phone = raw.cellphone ?? raw.phone ?? undefined
  const addresses = (raw.CustomerAddress ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: first,
    lastName: last,
    phone: phone ?? undefined,
    acceptsMarketing: raw.newsletter != null ? Boolean(Number(raw.newsletter)) : undefined,
    ordersCount: undefined,
    totalSpent: undefined,
    tags: undefined,
    defaultAddress: addresses[0],
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Bagy customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const fullName =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined

  const body: Record<string, unknown> = {
    name: fullName,
    email: customer.email,
    cellphone: customer.phone,
    newsletter: customer.acceptsMarketing != null ? (customer.acceptsMarketing ? 1 : 0) : undefined,
  }

  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.CustomerAddress = [
      {
        address: a.line1,
        complement: a.line2,
        city: a.city,
        state: a.region,
        zip: a.postalCode,
        country: a.country,
      },
    ]
  }

  return body
}
