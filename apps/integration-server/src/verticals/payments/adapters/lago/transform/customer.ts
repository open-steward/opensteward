/**
 * Lago Customer ↔ canonical Customer.
 *
 * Lago identifies customers by two ids: `lago_id` (internal UUID) and
 * `external_id` (the merchant-supplied id used in every other API call). We map
 * `external_id` onto both `id` and `externalId` so downstream callers address
 * the customer the way Lago's own API does. Billing address is a set of flat
 * `address_line1` / `city` / `state` / `zipcode` / `country` fields; shipping is
 * a nested `shipping_address` object. `metadata` is an array of `{key,value}`.
 *
 * Docs: https://getlago.com/docs/api-reference/customers/object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { pickCurrency, strMap } from './shared'

export interface RawLagoShippingAddress {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country?: string | null
}

export interface RawLagoCustomer {
  lago_id?: string
  external_id?: string
  name?: string | null
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  currency?: string | null
  legal_name?: string | null
  url?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country?: string | null
  shipping_address?: RawLagoShippingAddress | null
  metadata?: Array<{ key?: string; value?: unknown }> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapAddress(raw: RawLagoCustomer | RawLagoShippingAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_line1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipcode ?? undefined
  const country = raw.country ?? undefined
  const region = raw.state ?? undefined
  if (!line1 && !city && !postalCode && !country && !region) return undefined
  return {
    line1,
    line2: raw.address_line2 ?? undefined,
    city,
    region,
    postalCode,
    country: country ? country.toUpperCase() : undefined,
  }
}

export function transformCustomer(raw: RawLagoCustomer): Customer {
  const composed = [raw.firstname, raw.lastname].filter(Boolean).join(' ').trim()
  const id = String(raw.external_id ?? raw.lago_id ?? '')
  return {
    id,
    externalId: id,
    email: raw.email ?? undefined,
    name: raw.name ?? (composed || undefined),
    phone: raw.phone ?? undefined,
    currency: pickCurrency(raw.currency),
    billingAddress: mapAddress(raw),
    shippingAddress: mapAddress(raw.shipping_address),
    gateway: 'lago',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}

/** Canonical Customer → Lago create/update body. */
export function untransformCustomer(c: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.externalId !== undefined) out.external_id = c.externalId
  else if (c.id !== undefined) out.external_id = c.id
  if (c.email !== undefined) out.email = c.email
  if (c.name !== undefined) out.name = c.name
  if (c.phone !== undefined) out.phone = c.phone
  if (c.currency != null) out.currency = c.currency.toUpperCase()
  if (c.billingAddress != null) {
    const a = c.billingAddress
    if (a.line1 !== undefined) out.address_line1 = a.line1
    if (a.line2 !== undefined) out.address_line2 = a.line2
    if (a.city !== undefined) out.city = a.city
    if (a.region !== undefined) out.state = a.region
    if (a.postalCode !== undefined) out.zipcode = a.postalCode
    if (a.country !== undefined) out.country = a.country
  }
  return out
}
