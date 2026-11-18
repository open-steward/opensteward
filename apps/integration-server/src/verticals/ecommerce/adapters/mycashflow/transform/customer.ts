/**
 * MyCashflow Customer → canonical Customer.
 *
 * MyCashflow customer objects carry standard contact details (email,
 * first_name, last_name, phone) plus an `addresses` array. There is no
 * dedicated `default_address` field — we treat the first address as the
 * default.
 *
 * Docs: https://support.mycashflow.com/api/12-customers/
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawMyCashflowAddress {
  id?: number | string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface RawMyCashflowCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  addresses?: RawMyCashflowAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawMyCashflowAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawMyCashflowCustomer): Customer {
  const mappedAddresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)

  const phone =
    raw.phone ??
    raw.addresses?.find((a) => a.phone)?.phone ??
    undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: phone ?? undefined,
    defaultAddress: mappedAddresses[0],
    addresses: mappedAddresses.length > 0 ? mappedAddresses : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → MyCashflow customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['addresses'] = [
      {
        first_name: customer.firstName,
        last_name: customer.lastName,
        address: a.line1,
        address2: a.line2,
        city: a.city,
        region: a.region,
        postal_code: a.postalCode,
        country: a.country,
        phone: customer.phone,
        email: customer.email,
      },
    ]
  }
  return body
}
