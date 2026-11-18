/**
 * Yo!Kart User/Customer → canonical Customer.
 *
 * Yo!Kart stores buyer profiles under the "user" namespace. Key fields:
 *  - `user_id`          → id
 *  - `user_email`       → email
 *  - `user_firstname`   → firstName
 *  - `user_lastname`    → lastName
 *  - `user_mobile`      → phone
 *  - `user_created`     → createdAt
 *  - Addresses are stored under nested address objects.
 *
 * Yo!Kart customer API paths:
 *   GET /admin/users/listing        → paginated buyer list (data.users[])
 *   GET /admin/users/view/{id}      → single buyer detail
 *   POST /admin/users/add           → create buyer
 *   POST /admin/users/edit/{id}     → update buyer
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartAddress {
  address_name?: string | null
  address_phone?: string | null
  address_address1?: string | null
  address_address2?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  address_country?: string | null
  [key: string]: unknown
}

export interface RawYokartCustomer {
  user_id: number | string
  user_email?: string | null
  user_firstname?: string | null
  user_lastname?: string | null
  user_name?: string | null
  user_mobile?: string | null
  user_phone?: string | null
  user_created?: string
  user_updated?: string
  user_active?: string | number
  address?: RawYokartAddress | null
  addresses?: RawYokartAddress[]
  orders_count?: number | string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawYokartAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_address1 ?? undefined
  const line2 = raw.address_address2 ?? undefined
  const city = raw.address_city ?? undefined
  const region = raw.address_state ?? undefined
  const postalCode = raw.address_zip ?? undefined
  const country = raw.address_country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawYokartCustomer): Customer {
  const defaultAddress = mapAddress(raw.address)
  const addresses: Address[] = []
  if (defaultAddress) addresses.push(defaultAddress)
  if (raw.addresses && raw.addresses.length > 0) {
    for (const addr of raw.addresses) {
      const mapped = mapAddress(addr)
      if (mapped && mapped !== defaultAddress) addresses.push(mapped)
    }
  }

  const ordersCount =
    raw.orders_count != null
      ? typeof raw.orders_count === 'string'
        ? parseInt(raw.orders_count, 10)
        : raw.orders_count
      : undefined

  return {
    id: String(raw.user_id),
    email: raw.user_email ?? undefined,
    firstName: raw.user_firstname ?? undefined,
    lastName: raw.user_lastname ?? undefined,
    phone: raw.user_mobile ?? raw.user_phone ?? undefined,
    ordersCount: !Number.isNaN(ordersCount as number) ? ordersCount : undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.user_created),
    updatedAt: toIsoDatetime(raw.user_updated),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    user_email: customer.email,
    user_firstname: customer.firstName,
    user_lastname: customer.lastName,
    user_mobile: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['address_address1'] = a.line1
    body['address_address2'] = a.line2
    body['address_city'] = a.city
    body['address_state'] = a.region
    body['address_zip'] = a.postalCode
    body['address_country'] = a.country
  }
  return body
}
