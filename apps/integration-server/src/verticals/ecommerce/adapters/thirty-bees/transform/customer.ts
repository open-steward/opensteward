/**
 * Thirty Bees Customer → canonical Customer.
 *
 * Thirty Bees is a fork of PrestaShop 1.6 with an identical webservice API.
 * Customers live under `/api/customers`. Addresses are a separate resource
 * (`/api/addresses`) linked by `id_customer`. The adapter enriches the raw
 * customer with `_addresses` before transform.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawThirtyBeesAddress {
  id?: number | string
  id_customer?: number | string
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  id_state?: number | string | null
  postcode?: string | null
  id_country?: number | string | null
  phone?: string | null
  phone_mobile?: string | null
  [key: string]: unknown
}

export interface RawThirtyBeesCustomer {
  id: number | string
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  birthday?: string | null
  active?: string | number
  date_add?: string
  date_upd?: string
  note?: string | null
  id_gender?: number | string | null
  associations?: {
    groups?: Array<{ id: number | string }>
  }
  // Enriched by the adapter:
  _addresses?: RawThirtyBeesAddress[]
  [key: string]: unknown
}

function mapAddress(raw: RawThirtyBeesAddress): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  // Thirty Bees inherits PrestaShop's numeric `id_country` foreign key —
  // not an ISO 3166-1 alpha-2 code. Drop rather than emit something that
  // fails canonical schema validation. Raw value stays on metadata.
  const country = undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

export function transformCustomer(raw: RawThirtyBeesCustomer): Customer {
  const addresses: Address[] = []
  for (const addr of raw._addresses ?? []) {
    const mapped = mapAddress(addr)
    if (mapped) addresses.push(mapped)
  }

  const phone =
    raw._addresses?.[0]?.phone_mobile ??
    raw._addresses?.[0]?.phone ??
    undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.firstname ?? undefined,
    lastName: raw.lastname ?? undefined,
    phone,
    defaultAddress: addresses.length > 0 ? addresses[0] : undefined,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.date_add),
    updatedAt: toIsoDatetime(raw.date_upd),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    active: 1,
  }
}
