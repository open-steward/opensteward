/**
 * Jumpseller Customer → canonical Customer.
 *
 * API:
 *  - GET    /customers.json           → paginated array
 *  - GET    /customers/{id}.json      → single customer
 *  - POST   /customers.json           → create customer
 *  - PUT    /customers/{id}.json      → update customer
 *  - DELETE /customers/{id}.json      → delete customer
 *
 * Key fields: id, email, first_name, last_name, phone, phone_prefix,
 *             billing_address, shipping_address, created_at, updated_at.
 *
 * Docs: https://jumpseller.com/support/api/
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawJumpsellerAddress {
  name?: string | null
  surname?: string | null
  address?: string | null
  city?: string | null
  postal?: string | null
  region?: string | null
  region_code?: string | null
  country?: string | null
  country_code?: string | null
  street_number?: string | null
  complement?: string | null
  [key: string]: unknown
}

export interface RawJumpsellerCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  phone_prefix?: string | null
  billing_address?: RawJumpsellerAddress | null
  shipping_address?: RawJumpsellerAddress | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawJumpsellerAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = [raw.address, raw.street_number].filter(Boolean).join(' ') || undefined
  const line2 = raw.complement ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? raw.region_code ?? undefined
  const postalCode = raw.postal ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawJumpsellerCustomer): Customer {
  const phone = raw.phone_prefix && raw.phone
    ? `${raw.phone_prefix}${raw.phone}`
    : (raw.phone ?? undefined)

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone,
    defaultAddress: mapAddress(raw.billing_address),
    addresses: [
      mapAddress(raw.billing_address),
      mapAddress(raw.shipping_address),
    ].filter((a): a is Address => !!a),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.billing_address = {
      address: a.line1,
      complement: a.line2,
      city: a.city,
      postal: a.postalCode,
      region: a.region,
      country_code: a.country,
    }
  }
  return body
}
