/**
 * Unzer customer (`/v1/customers`) ↔ canonical Customer.
 *
 * Unzer's resource id (`s-cst-…`) is the canonical id; the merchant-supplied
 * `customerId` is preserved in metadata. Names are split into
 * `firstname` / `lastname`; the canonical `name` re-joins them. Unzer addresses
 * use German-style field names (`street`, `zip`, `state`, `country`).
 */
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { strMap } from './shared'

export interface RawUnzerAddress {
  name?: string
  street?: string
  state?: string
  zip?: string
  city?: string
  country?: string
}

export interface RawUnzerCustomer {
  id?: string
  firstname?: string
  lastname?: string
  salutation?: string
  company?: string
  customerId?: string
  birthDate?: string
  email?: string
  phone?: string
  mobile?: string
  billingAddress?: RawUnzerAddress
  shippingAddress?: RawUnzerAddress
  [k: string]: unknown
}

function mapAddress(raw: RawUnzerAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street || undefined
  const city = raw.city || undefined
  const postalCode = raw.zip || undefined
  const country = raw.country || undefined
  const region = raw.state || undefined
  if (!line1 && !city && !postalCode && !country && !region) return undefined
  return {
    line1,
    city,
    region,
    postalCode,
    country: country ? country.toUpperCase() : undefined,
  }
}

export function transformCustomer(raw: RawUnzerCustomer): Customer {
  const name = [raw.firstname, raw.lastname].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? raw.customerId ?? ''),
    externalId: String(raw.id ?? raw.customerId ?? ''),
    email: raw.email || undefined,
    name: name || undefined,
    phone: raw.phone || raw.mobile || undefined,
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    gateway: 'unzer',
    metadata: strMap({
      customerId: raw.customerId,
      salutation: raw.salutation,
      company: raw.company,
      birthDate: raw.birthDate,
      mobile: raw.mobile,
    }),
    raw,
  }
}

/** Canonical Customer → Unzer create/update body. */
export function untransformCustomer(c: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.name != null) {
    const [firstname, ...rest] = c.name.trim().split(/\s+/)
    if (firstname) out.firstname = firstname
    if (rest.length > 0) out.lastname = rest.join(' ')
  }
  if (c.email != null) out.email = c.email
  if (c.phone != null) out.phone = c.phone
  if (c.billingAddress != null) {
    out.billingAddress = unmapAddress(c.billingAddress)
  }
  if (c.shippingAddress != null) {
    out.shippingAddress = unmapAddress(c.shippingAddress)
  }
  return out
}

function unmapAddress(addr: Address): RawUnzerAddress {
  const out: RawUnzerAddress = {}
  if (addr.line1 != null) out.street = addr.line1
  if (addr.region != null) out.state = addr.region
  if (addr.postalCode != null) out.zip = addr.postalCode
  if (addr.city != null) out.city = addr.city
  if (addr.country != null) out.country = addr.country
  return out
}
