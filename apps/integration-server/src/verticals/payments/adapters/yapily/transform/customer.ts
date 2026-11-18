/**
 * Stripe Customer ↔ canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIso, fromIso, strMap, pickStr } from './shared'

export interface RawStripeAddress {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}

export interface RawStripeCustomer {
  id: string
  object: 'customer'
  email?: string | null
  name?: string | null
  phone?: string | null
  description?: string | null
  currency?: string | null
  balance?: number
  delinquent?: boolean
  default_source?: string | null
  invoice_settings?: { default_payment_method?: string | null } | null
  address?: RawStripeAddress | null
  shipping?: { address?: RawStripeAddress | null } | null
  metadata?: Record<string, string> | null
  created?: number
  livemode?: boolean
  [key: string]: unknown
}

function mapAddress(raw: RawStripeAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.line2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country: country?.toUpperCase(),
  }
}

function unmapAddress(addr: Address | undefined): RawStripeAddress | undefined {
  if (!addr) return undefined
  const out: RawStripeAddress = {}
  if (addr.line1 !== undefined) out.line1 = addr.line1
  if (addr.line2 !== undefined) out.line2 = addr.line2
  if (addr.city !== undefined) out.city = addr.city
  if (addr.region !== undefined) out.state = addr.region
  if (addr.postalCode !== undefined) out.postal_code = addr.postalCode
  if (addr.country !== undefined) out.country = addr.country
  return out
}

export function transformCustomer(raw: RawStripeCustomer): Customer {
  return {
    id: raw.id,
    externalId: raw.id,
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone: raw.phone ?? undefined,
    description: raw.description ?? undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    balance: typeof raw.balance === 'number' ? raw.balance : undefined,
    delinquent: raw.delinquent ?? undefined,
    defaultPaymentMethodId:
      raw.invoice_settings?.default_payment_method ?? raw.default_source ?? undefined,
    billingAddress: mapAddress(raw.address),
    shippingAddress: mapAddress(raw.shipping?.address),
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}

export function untransformCustomer(c: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.email !== undefined) out.email = c.email
  if (c.name !== undefined) out.name = c.name
  if (c.phone !== undefined) out.phone = c.phone
  if (c.description !== undefined) out.description = c.description
  if (c.currency != null) out.currency = c.currency.toLowerCase()
  if (c.balance !== undefined) out.balance = c.balance
  if (c.billingAddress != null) out.address = unmapAddress(c.billingAddress)
  if (c.shippingAddress != null) out.shipping = { address: unmapAddress(c.shippingAddress) }
  if (c.defaultPaymentMethodId !== undefined) {
    out.invoice_settings = { default_payment_method: c.defaultPaymentMethodId }
  }
  if (c.metadata) out.metadata = c.metadata
  // round-trip safety — reference these so tooling doesn't flag them unused
  void fromIso
  void pickStr
  return out
}
