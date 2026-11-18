/**
 * PrestaShop Customer → canonical Customer.
 *
 * PrestaShop customers live under `/api/customers`. Addresses are a
 * separate resource (`/api/addresses`) linked by `id_customer`. The
 * adapter enriches the raw customer with `_addresses` before transform.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawPrestaShopAddress {
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

export interface RawPrestaShopCustomer {
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
  _addresses?: RawPrestaShopAddress[]
  [key: string]: unknown
}

function mapAddress(raw: RawPrestaShopAddress): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  // PrestaShop's `id_country` is a numeric foreign key into its own
  // country table — not an ISO 3166-1 alpha-2 code. Drop it rather than
  // emit something that fails canonical schema validation. Resolving the
  // ID requires a separate /countries fetch which the transform layer
  // doesn't have. The raw value is preserved on `customer.metadata`.
  const country = undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

export function transformCustomer(raw: RawPrestaShopCustomer): Customer {
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
