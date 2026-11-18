/**
 * Dooca Commerce Customer → canonical Customer.
 *
 * Dooca customer key fields:
 *   - `name` is the full name (split on first space for firstName/lastName)
 *   - `first_name` / `last_name` may also be present separately
 *   - `email`, `cgc` (CPF/CNPJ), `birthday`
 *   - `orders_count`, `active`
 *   - `address` — single address object with Brazilian postal fields
 *     (zipcode, street, number, detail, district, city, state)
 *   - `created_at`, `updated_at`
 *
 * Docs: https://docs.dooca.com.br/clientes/api
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawDoocaAddress {
  receiver?: string | null
  zipcode?: string | null
  street?: string | null
  number?: string | null
  detail?: string | null       // complement / address2
  district?: string | null     // neighbourhood
  city?: string | null
  state?: string | null        // 2-letter BR state code
  [key: string]: unknown
}

export interface RawDoocaCustomer {
  id: number | string
  email?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  cgc?: string | null          // CPF / CNPJ
  phone?: string | null
  active?: boolean
  orders_count?: number
  group?: { id?: number | string; name?: string } | null
  address?: RawDoocaAddress | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawDoocaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const street = raw.street ?? undefined
  const number = raw.number ?? undefined
  const line1 = street && number ? `${street}, ${number}` : (street ?? undefined)
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.state ? 'BR' : undefined
  if (!line1 && !city && !postalCode) return undefined
  return {
    line1,
    line2: raw.detail ?? raw.district ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function splitName(
  full: string | null | undefined,
  first: string | null | undefined,
  last: string | null | undefined,
): { firstName?: string; lastName?: string } {
  if (first || last) {
    return { firstName: first ?? undefined, lastName: last ?? undefined }
  }
  if (!full) return {}
  const idx = full.indexOf(' ')
  if (idx < 0) return { firstName: full }
  return { firstName: full.slice(0, idx), lastName: full.slice(idx + 1) }
}

export function transformCustomer(raw: RawDoocaCustomer): Customer {
  const { firstName, lastName } = splitName(raw.name, raw.first_name, raw.last_name)
  const address = mapAddress(raw.address)
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone: raw.phone ?? undefined,
    ordersCount: raw.orders_count,
    defaultAddress: address,
    addresses: address ? [address] : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Dooca customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
  if (customer.firstName || customer.lastName) {
    body['name'] = [customer.firstName, customer.lastName].filter(Boolean).join(' ')
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    // Street and number are separate fields in Dooca
    const parts = (a.line1 ?? '').split(',')
    body['address'] = {
      street: parts[0]?.trim(),
      number: parts[1]?.trim(),
      detail: a.line2,
      city: a.city,
      state: a.region,
      zipcode: a.postalCode,
    }
  }
  return body
}
