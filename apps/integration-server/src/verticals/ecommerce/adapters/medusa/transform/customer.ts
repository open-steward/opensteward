/**
 * Medusa v2 Customer → canonical Customer.
 *
 * Medusa customers have `first_name`, `last_name`, `email`, `phone`,
 * and optional `addresses[]` with the standard address fields.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawMedusaAddress {
  id?: string
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawMedusaCustomer {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  has_account?: boolean
  orders?: Array<{ id: string }> | null
  addresses?: RawMedusaAddress[] | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawMedusaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawMedusaCustomer): Customer {
  const addresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    ordersCount: raw.orders?.length,
    defaultAddress: addresses[0],
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
}
